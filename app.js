const storageKey = "durian-booking-reservations-v2";

const state = {
  mode: "delivery",
  videos: [],
  selectedVideoIds: new Set(),
  bookings: readBookings(),
};

const els = {
  addVideo: document.querySelector("#addVideo"),
  videoList: document.querySelector("#videoList"),
  deliveryMode: document.querySelector("#deliveryMode"),
  pickupMode: document.querySelector("#pickupMode"),
  deliveryFields: document.querySelector("#deliveryFields"),
  bookingForm: document.querySelector("#bookingForm"),
  bookerName: document.querySelector("#bookerName"),
  fruitQty: document.querySelector("#fruitQty"),
  receiverName: document.querySelector("#receiverName"),
  receiverPhone: document.querySelector("#receiverPhone"),
  receiverAddress: document.querySelector("#receiverAddress"),
  note: document.querySelector("#note"),
  selectedSlotsText: document.querySelector("#selectedSlotsText"),
  bookingCount: document.querySelector("#bookingCount"),
  totalFruit: document.querySelector("#totalFruit"),
  deliveryCount: document.querySelector("#deliveryCount"),
  pickupCount: document.querySelector("#pickupCount"),
  searchInput: document.querySelector("#searchInput"),
  bookingList: document.querySelector("#bookingList"),
  bookingCardTemplate: document.querySelector("#bookingCardTemplate"),
  exportCsv: document.querySelector("#exportCsv"),
  exportJson: document.querySelector("#exportJson"),
  clearAll: document.querySelector("#clearAll"),
};

init();

function init() {
  state.videos = Array.from({ length: 4 }, (_, index) => createVideoItem(index + 1));
  setupEvents();
  renderVideos();
  renderMode();
  renderBookings();
  syncSelectedText();
}

function setupEvents() {
  els.addVideo.addEventListener("click", () => {
    state.videos.push(createVideoItem(nextVideoNumber()));
    renderVideos();
  });

  els.deliveryMode.addEventListener("click", () => setMode("delivery"));
  els.pickupMode.addEventListener("click", () => setMode("pickup"));
  els.bookingForm.addEventListener("submit", handleBookingSubmit);
  els.searchInput.addEventListener("input", renderBookings);
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportJson.addEventListener("click", exportJson);
  els.clearAll.addEventListener("click", clearAllBookings);
}

function createVideoItem(number) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${number}`,
    no: `No.${String(number).padStart(2, "0")}`,
    description: "",
    objectUrl: "",
    fileName: "",
  };
}

function renderVideos() {
  const reservedNos = getReservedNos();
  els.videoList.innerHTML = "";

  state.videos.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "durian-video-card";
    card.dataset.videoId = item.id;

    const isSelected = state.selectedVideoIds.has(item.id);
    const isReserved = reservedNos.has(normalizeNo(item.no));

    card.innerHTML = `
      <div class="video-card-head">
        <label>
          No. ลูกทุเรียน
          <input data-video-no type="text" value="${escapeHtml(item.no)}" placeholder="เช่น No.01" />
        </label>
        <button type="button" class="remove-video" data-remove-video ${state.videos.length === 1 ? "disabled" : ""}>ลบวิดีโอ</button>
      </div>
      <div class="video-frame ${item.objectUrl ? "has-video" : ""}">
        <video data-video-player controls playsinline poster="./assets/durian-video-poster.png"></video>
        <div class="video-no-badge">${escapeHtml(item.no || `No.${index + 1}`)}</div>
        <div class="video-empty">
          <strong>${escapeHtml(item.no || `No.${index + 1}`)}</strong>
          <span>ยังไม่ได้ใส่วิดีโอของลูกนี้</span>
        </div>
      </div>
      <div class="video-card-actions">
        <label class="upload-button">
          เลือกวิดีโอ
          <input data-video-input type="file" accept="video/*" />
        </label>
        <button type="button" class="cf-slot ${isSelected ? "selected" : ""} ${isReserved ? "reserved" : ""}" data-cf-video ${isReserved ? "disabled" : ""}>
          <strong>${escapeHtml(item.no || "No.")}</strong>
          <span>${isReserved ? "จองแล้ว" : isSelected ? "เลือกอยู่" : "กด CF ลูกนี้"}</span>
        </button>
      </div>
      <label>
        ข้อความอธิบายลูกทุเรียนในวิดีโอ
        <textarea data-video-description rows="3" placeholder="เช่น ลูกใหญ่ หนามสวย ทรงกลม น้ำหนักประมาณ 3 กก.">${escapeHtml(item.description)}</textarea>
      </label>
    `;

    const video = card.querySelector("[data-video-player]");
    if (item.objectUrl) video.src = item.objectUrl;

    card.querySelector("[data-video-no]").addEventListener("input", (event) => {
      item.no = event.target.value.trim();
      syncSelectedText();
      renderBookings();
      updateCardCfLabel(card, item);
    });

    card.querySelector("[data-video-description]").addEventListener("input", (event) => {
      item.description = event.target.value.trim();
    });

    card.querySelector("[data-video-input]").addEventListener("change", (event) => {
      handleVideoUpload(event, item);
      renderVideos();
    });

    card.querySelector("[data-cf-video]").addEventListener("click", () => toggleVideoSelection(item.id));
    card.querySelector("[data-remove-video]").addEventListener("click", () => removeVideo(item.id));
    els.videoList.appendChild(card);
  });
}

function updateCardCfLabel(card, item) {
  const strong = card.querySelector("[data-cf-video] strong");
  const emptyTitle = card.querySelector(".video-empty strong");
  const badge = card.querySelector(".video-no-badge");
  const label = item.no || "No.";
  strong.textContent = label;
  emptyTitle.textContent = label;
  badge.textContent = label;
}

function handleVideoUpload(event, item) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  item.objectUrl = URL.createObjectURL(file);
  item.fileName = file.name;
}

function toggleVideoSelection(videoId) {
  if (state.selectedVideoIds.has(videoId)) {
    state.selectedVideoIds.delete(videoId);
  } else {
    state.selectedVideoIds.add(videoId);
  }
  els.fruitQty.value = Math.max(1, state.selectedVideoIds.size);
  renderVideos();
  syncSelectedText();
}

function removeVideo(videoId) {
  if (state.videos.length <= 1) return;
  const item = state.videos.find((video) => video.id === videoId);
  if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
  state.videos = state.videos.filter((video) => video.id !== videoId);
  state.selectedVideoIds.delete(videoId);
  renderVideos();
  syncSelectedText();
}

function setMode(mode) {
  state.mode = mode;
  renderMode();
}

function renderMode() {
  const isDelivery = state.mode === "delivery";
  els.deliveryMode.classList.toggle("active", isDelivery);
  els.pickupMode.classList.toggle("active", !isDelivery);
  els.deliveryMode.setAttribute("aria-selected", String(isDelivery));
  els.pickupMode.setAttribute("aria-selected", String(!isDelivery));
  els.deliveryFields.hidden = !isDelivery;
  els.receiverName.required = isDelivery;
  els.receiverPhone.required = isDelivery;
  els.receiverAddress.required = isDelivery;
}

function syncSelectedText() {
  const selected = selectedVideos();
  els.selectedSlotsText.textContent = selected.length
    ? selected.map((item) => item.no || "No. ไม่ระบุ").join(", ")
    : "ยังไม่ได้เลือก";
}

function handleBookingSubmit(event) {
  event.preventDefault();

  if (!state.selectedVideoIds.size) {
    alert("กรุณากด CF ใต้วิดีโอของลูกที่ต้องการจองก่อน");
    return;
  }

  const fruits = selectedVideos().map((item) => ({
    no: item.no || "No. ไม่ระบุ",
    description: item.description,
    fileName: item.fileName,
  }));

  const qty = clampNumber(els.fruitQty.value, 1, 999);
  const booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    mode: state.mode,
    bookerName: els.bookerName.value.trim(),
    fruitQty: qty,
    cfSlots: fruits.map((fruit) => fruit.no),
    fruits,
    receiverName: state.mode === "delivery" ? els.receiverName.value.trim() : "",
    receiverPhone: state.mode === "delivery" ? els.receiverPhone.value.trim() : "",
    receiverAddress: state.mode === "delivery" ? els.receiverAddress.value.trim() : "",
    note: els.note.value.trim(),
  };

  state.bookings.unshift(booking);
  saveBookings();
  state.selectedVideoIds.clear();
  els.bookingForm.reset();
  els.fruitQty.value = 1;
  renderMode();
  renderVideos();
  syncSelectedText();
  renderBookings();
}

function renderBookings() {
  const query = els.searchInput.value.trim().toLowerCase();
  const bookings = state.bookings.filter((booking) => {
    const haystack = [
      booking.bookerName,
      booking.receiverName,
      booking.receiverPhone,
      booking.receiverAddress,
      booking.note,
      booking.cfSlots.join(" "),
      fruitDescriptionText(booking),
      modeLabel(booking.mode),
    ].join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });

  els.bookingList.innerHTML = "";
  if (!bookings.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = state.bookings.length ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีรายการจอง";
    els.bookingList.appendChild(empty);
  } else {
    bookings.forEach((booking) => els.bookingList.appendChild(createBookingCard(booking)));
  }

  renderStats();
}

function createBookingCard(booking) {
  const card = els.bookingCardTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector("[data-booker]").textContent = booking.bookerName || "ไม่ระบุชื่อ";
  card.querySelector("[data-mode]").textContent = `${modeLabel(booking.mode)} • ${formatDate(booking.createdAt)}`;
  card.querySelector("[data-qty]").textContent = `${booking.fruitQty.toLocaleString("th-TH")} ลูก`;
  card.querySelector("[data-slots]").textContent = booking.cfSlots.length ? booking.cfSlots.join(", ") : "ไม่ระบุ No.";
  card.querySelector("[data-fruits]").textContent = fruitDescriptionText(booking) || "-";
  card.querySelector("[data-destination]").textContent = destinationText(booking);
  card.querySelector("[data-note]").textContent = booking.note || "-";
  card.querySelector("[data-delete]").addEventListener("click", () => deleteBooking(booking.id));
  return card;
}

function renderStats() {
  const totalFruit = state.bookings.reduce((sum, booking) => sum + Number(booking.fruitQty || 0), 0);
  const deliveryCount = state.bookings.filter((booking) => booking.mode === "delivery").length;
  const pickupCount = state.bookings.filter((booking) => booking.mode === "pickup").length;
  els.bookingCount.textContent = state.bookings.length.toLocaleString("th-TH");
  els.totalFruit.textContent = totalFruit.toLocaleString("th-TH");
  els.deliveryCount.textContent = deliveryCount.toLocaleString("th-TH");
  els.pickupCount.textContent = pickupCount.toLocaleString("th-TH");
}

function deleteBooking(id) {
  state.bookings = state.bookings.filter((booking) => booking.id !== id);
  saveBookings();
  renderVideos();
  renderBookings();
}

function clearAllBookings() {
  if (!state.bookings.length) return;
  if (!confirm("ล้างรายการจองทั้งหมดในเครื่องนี้หรือไม่?")) return;
  state.bookings = [];
  state.selectedVideoIds.clear();
  saveBookings();
  renderVideos();
  syncSelectedText();
  renderBookings();
}

function exportCsv() {
  const rows = [
    ["createdAt", "mode", "bookerName", "fruitQty", "durianNos", "durianDescriptions", "receiverName", "receiverPhone", "receiverAddress", "note"],
    ...state.bookings.map((booking) => [
      booking.createdAt,
      modeLabel(booking.mode),
      booking.bookerName,
      booking.fruitQty,
      booking.cfSlots.join(" "),
      fruitDescriptionText(booking),
      booking.receiverName,
      booking.receiverPhone,
      booking.receiverAddress,
      booking.note,
    ]),
  ];
  download("durian-bookings.csv", toCsv(rows), "text/csv;charset=utf-8");
}

function exportJson() {
  download("durian-bookings.json", JSON.stringify(state.bookings, null, 2), "application/json");
}

function selectedVideos() {
  return state.videos.filter((item) => state.selectedVideoIds.has(item.id));
}

function getReservedNos() {
  const nos = new Set();
  state.bookings.forEach((booking) => booking.cfSlots.forEach((no) => nos.add(normalizeNo(no))));
  return nos;
}

function readBookings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookings() {
  localStorage.setItem(storageKey, JSON.stringify(state.bookings));
}

function destinationText(booking) {
  if (booking.mode === "pickup") return "รับที่โรงงาน/บ้าน";
  return [booking.receiverName, booking.receiverPhone, booking.receiverAddress].filter(Boolean).join(" / ") || "-";
}

function fruitDescriptionText(booking) {
  const fruits = Array.isArray(booking.fruits) ? booking.fruits : [];
  if (!fruits.length) return "";
  return fruits.map((fruit) => `${fruit.no}${fruit.description ? `: ${fruit.description}` : ""}`).join(" | ");
}

function modeLabel(mode) {
  return mode === "delivery" ? "ส่งทางไกล" : "รับที่โรงงาน/บ้าน";
}

function nextVideoNumber() {
  return state.videos.length + 1;
}

function normalizeNo(value) {
  return String(value || "").trim().toLowerCase();
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toCsv(rows) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function download(filename, content, type) {
  const blob = new Blob(["\ufeff", content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
