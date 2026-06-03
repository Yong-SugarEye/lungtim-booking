const storageKey = "durian-booking-reservations-v2";
const isAdmin = new URLSearchParams(window.location.search).get("admin") === "1";
const firebaseVersion = "10.12.5";

const fb = {
  enabled: false,
  db: null,
  api: null,
  saveTimers: new Map(),
  seededVideos: false,
};

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
  customerLookupInput: document.querySelector("#customerLookupInput"),
  customerLookupList: document.querySelector("#customerLookupList"),
  latestBookingNotice: document.querySelector("#latestBookingNotice"),
  exportCsv: document.querySelector("#exportCsv"),
  exportJson: document.querySelector("#exportJson"),
  clearAll: document.querySelector("#clearAll"),
};

init();

async function init() {
  document.body.classList.toggle("admin-mode", isAdmin);
  document.body.classList.toggle("customer-mode", !isAdmin);
  state.videos = Array.from({ length: 4 }, (_, index) => createVideoItem(index + 1));
  setupEvents();
  renderVideos();
  renderMode();
  renderBookings();
  renderCustomerLookup();
  syncSelectedText();
  await initFirebase();
  if (fb.enabled) {
    subscribeVideos();
    subscribeBookings();
  }
}

function setupEvents() {
  els.addVideo.addEventListener("click", () => {
    const item = createVideoItem(nextVideoNumber());
    if (fb.enabled && isAdmin) {
      saveVideoItem(item);
    } else {
      state.videos.push(item);
      renderVideos();
    }
  });

  els.deliveryMode.addEventListener("click", () => setMode("delivery"));
  els.pickupMode.addEventListener("click", () => setMode("pickup"));
  els.bookingForm.addEventListener("submit", handleBookingSubmit);
  els.searchInput.addEventListener("input", renderBookings);
  els.customerLookupInput?.addEventListener("input", renderCustomerLookup);
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportJson.addEventListener("click", exportJson);
  els.clearAll.addEventListener("click", clearAllBookings);
}

async function initFirebase() {
  const config = window.firebaseConfig || {};
  if (!config.apiKey || String(config.apiKey).includes("PASTE_") || !config.projectId) {
    console.info("Firebase ยังไม่ได้ตั้งค่า ใช้โหมด local ชั่วคราว");
    return;
  }

  try {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-app.js`);
    const firestoreMod = await import(`https://www.gstatic.com/firebasejs/${firebaseVersion}/firebase-firestore.js`);
    const app = appMod.initializeApp(config);
    fb.db = firestoreMod.getFirestore(app);
    fb.api = { ...firestoreMod };
    fb.enabled = true;
  } catch (error) {
    console.error("เปิด Firebase ไม่สำเร็จ", error);
    alert("เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาตรวจ firebase-config.js");
  }
}

function createVideoItem(number) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${number}`,
    no: `No.${String(number).padStart(2, "0")}`,
    description: "",
    objectUrl: "",
    videoUrl: "",
    fileName: "",
    sort: number,
  };
}

function subscribeVideos() {
  const { collection, onSnapshot, orderBy, query } = fb.api;
  const videosQuery = query(collection(fb.db, "videos"), orderBy("sort", "asc"));

  onSnapshot(videosQuery, (snapshot) => {
    if (!snapshot.empty) {
      state.videos = snapshot.docs.map((docSnapshot, index) => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          no: data.no || `No.${String(index + 1).padStart(2, "0")}`,
          description: data.description || "",
          objectUrl: "",
          videoUrl: data.videoUrl || "",
          storagePath: data.storagePath || "",
          fileName: data.fileName || "",
          sort: Number(data.sort || index + 1),
        };
      });
    } else if (isAdmin && !fb.seededVideos) {
      fb.seededVideos = true;
      state.videos.forEach((item, index) => {
        item.sort = item.sort || index + 1;
        saveVideoItem(item);
      });
    }

    dropMissingSelections();
    renderVideos();
    syncSelectedText();
  });
}

function subscribeBookings() {
  const { collection, onSnapshot, orderBy, query } = fb.api;
  const bookingsQuery = query(collection(fb.db, "bookings"), orderBy("createdAtMs", "desc"));

  onSnapshot(bookingsQuery, (snapshot) => {
    state.bookings = snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }));
    renderVideos();
    renderBookings();
    renderCustomerLookup();
  });
}

function renderVideos() {
  const reservedNos = getReservedNos();
  els.videoList.innerHTML = "";

  state.videos.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = `durian-video-card ${isAdmin ? "admin-card" : "customer-card"}`;
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
      <div class="video-frame ${videoSource(item) ? "has-video" : ""}">
        <video data-video-player controls playsinline poster="./assets/durian-video-poster.png"></video>
        <div class="video-no-badge">${escapeHtml(item.no || `No.${index + 1}`)}</div>
        <div class="video-empty">
          <strong>${escapeHtml(item.no || `No.${index + 1}`)}</strong>
          <span>ยังไม่ได้ใส่วิดีโอของลูกนี้</span>
        </div>
      </div>
      <div class="video-card-actions">
        <label class="upload-button">
          พรีวิวไฟล์
          <input data-video-input type="file" accept="video/*" />
        </label>
        <button type="button" class="cf-slot ${isSelected ? "selected" : ""} ${isReserved ? "reserved" : ""}" data-cf-video ${isReserved ? "disabled" : ""}>
          <strong>${escapeHtml(item.no || "No.")}</strong>
          <span>${isReserved ? "จองแล้ว" : isSelected ? "เลือกอยู่" : "กด CF ลูกนี้"}</span>
        </button>
      </div>
      <label class="video-link-field">
        ลิงก์วิดีโอ Google Drive
        <input data-video-url type="url" value="${escapeHtml(item.videoUrl || "")}" placeholder="วางลิงก์แชร์ Google Drive ของวิดีโอนี้" />
      </label>
      <label>
        ข้อความอธิบายลูกทุเรียนในวิดีโอ
        <textarea data-video-description rows="3" placeholder="เช่น ลูกใหญ่ หนามสวย ทรงกลม น้ำหนักประมาณ 3 กก.">${escapeHtml(item.description)}</textarea>
      </label>
    `;

    const src = videoSource(item);
    setVideoFrameSource(card, item, src);

    if (isAdmin) {
      card.querySelector("[data-video-no]").addEventListener("input", (event) => {
        item.no = event.target.value.trim();
        syncSelectedText();
        renderBookings();
        updateCardCfLabel(card, item);
        scheduleSaveVideo(item);
      });

      card.querySelector("[data-video-description]").addEventListener("input", (event) => {
        item.description = event.target.value.trim();
        scheduleSaveVideo(item);
      });

      card.querySelector("[data-video-input]").addEventListener("change", (event) => {
        handleVideoUpload(event, item);
      });

      card.querySelector("[data-video-url]").addEventListener("input", (event) => {
        item.videoUrl = event.target.value.trim();
        item.storagePath = "";
        scheduleSaveVideo(item);
        setVideoFrameSource(card, item, videoSource(item));
      });

      card.querySelector("[data-remove-video]").addEventListener("click", () => removeVideo(item.id));
    } else {
      card.querySelector(".video-card-head").hidden = true;
      card.querySelector(".video-link-field").hidden = true;
      card.querySelector("[data-video-description]").closest("label").hidden = true;
      const description = document.createElement("p");
      description.className = "customer-description";
      description.textContent = item.description || "กด CF ใต้คลิปนี้เพื่อเลือกจองลูกนี้";
      card.appendChild(description);
    }

    card.querySelector("[data-cf-video]").addEventListener("click", () => toggleVideoSelection(item.id));
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

function scheduleSaveVideo(item) {
  if (!fb.enabled || !isAdmin) return;
  clearTimeout(fb.saveTimers.get(item.id));
  fb.saveTimers.set(
    item.id,
    setTimeout(() => {
      saveVideoItem(item);
      fb.saveTimers.delete(item.id);
    }, 500)
  );
}

async function saveVideoItem(item) {
  if (!fb.enabled || !isAdmin) return;

  const { doc, serverTimestamp, setDoc } = fb.api;
  const sort = Number(item.sort || extractVideoNumber(item.no) || state.videos.indexOf(item) + 1);

  await setDoc(
    doc(fb.db, "videos", item.id),
    {
      no: item.no || `No.${String(sort).padStart(2, "0")}`,
      description: item.description || "",
      videoUrl: item.videoUrl || "",
      fileName: item.fileName || "",
      storagePath: item.storagePath || "",
      sort,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function videoSource(item) {
  return item.videoUrl || item.objectUrl || "";
}

function setVideoFrameSource(card, item, src) {
  const video = card.querySelector("[data-video-player]");
  video.hidden = false;
  const driveVideo = googleDriveVideoUrl(item.videoUrl);
  if (driveVideo) {
    video.src = driveVideo;
  } else if (src) {
    video.src = src;
  } else {
    video.removeAttribute("src");
  }
}

async function handleVideoUpload(event, item) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  item.objectUrl = URL.createObjectURL(file);
  item.fileName = file.name;
  renderVideos();
  alert("ไฟล์นี้เป็นพรีวิวในเครื่องเท่านั้น ถ้าต้องการให้ลูกค้าเห็น ให้ใส่ลิงก์ Google Drive ในช่องลิงก์วิดีโอ");
}

function toggleVideoSelection(videoId) {
  if (state.selectedVideoIds.has(videoId)) {
    state.selectedVideoIds.delete(videoId);
  } else {
    state.selectedVideoIds.add(videoId);
  }
  els.fruitQty.value = state.selectedVideoIds.size;
  renderVideos();
  syncSelectedText();
}

async function removeVideo(videoId) {
  if (state.videos.length <= 1) return;
  const item = state.videos.find((video) => video.id === videoId);
  if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);

  if (fb.enabled && isAdmin) {
    const { deleteDoc, doc } = fb.api;
    await deleteDoc(doc(fb.db, "videos", videoId));
    return;
  }

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

async function handleBookingSubmit(event) {
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

  const qty = state.selectedVideoIds.size;
  const booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now(),
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

  if (fb.enabled) {
    try {
      const { addDoc, collection } = fb.api;
      const { id, ...bookingData } = booking;
      const docRef = await addDoc(collection(fb.db, "bookings"), bookingData);
      booking.id = docRef.id;
      state.bookings.unshift(booking);
    } catch (error) {
      console.error("Save booking failed", error);
      alert("บันทึกการจองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }
  } else {
    state.bookings.unshift(booking);
    saveBookings();
  }

  state.selectedVideoIds.clear();
  els.bookingForm.reset();
  els.fruitQty.value = 0;
  renderMode();
  renderVideos();
  syncSelectedText();
  renderBookings();
  renderCustomerLookup(booking.id);
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

function renderCustomerLookup(latestBookingId = "") {
  if (!els.customerLookupList) return;

  const query = els.customerLookupInput.value.trim().toLowerCase();
  const bookings = state.bookings.filter((booking) => {
    const haystack = searchableBookingText(booking);
    return !query || haystack.includes(query);
  });

  els.customerLookupList.innerHTML = "";
  if (latestBookingId) {
    const latest = state.bookings.find((booking) => booking.id === latestBookingId);
    if (latest) {
      els.latestBookingNotice.hidden = false;
      els.latestBookingNotice.innerHTML = `
        <strong>บันทึกการจองแล้ว</strong>
        <span>รหัสจอง ${escapeHtml(shortBookingId(latest.id))} • ลูกที่เลือก ${escapeHtml(latest.cfSlots.join(", "))}</span>
      `;
    }
  }

  if (!bookings.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = state.bookings.length
      ? "ไม่พบรายการที่ค้นหาในเครื่องนี้"
      : "ยังไม่มีรายการจองในเครื่องนี้";
    els.customerLookupList.appendChild(empty);
    return;
  }

  bookings.forEach((booking) => els.customerLookupList.appendChild(createLookupCard(booking)));
}

function createLookupCard(booking) {
  const card = document.createElement("article");
  card.className = "booking-card lookup-card";
  card.innerHTML = `
    <div class="booking-card-head">
      <div>
        <strong>${escapeHtml(booking.bookerName || "ไม่ระบุชื่อ")}</strong>
        <span>รหัสจอง ${escapeHtml(shortBookingId(booking.id))} • ${escapeHtml(formatDate(booking.createdAt))}</span>
      </div>
    </div>
    <dl>
      <div><dt>จำนวน</dt><dd>${escapeHtml(`${booking.fruitQty.toLocaleString("th-TH")} ลูก`)}</dd></div>
      <div><dt>No.</dt><dd>${escapeHtml(booking.cfSlots.length ? booking.cfSlots.join(", ") : "ไม่ระบุ No.")}</dd></div>
      <div><dt>รายละเอียด</dt><dd>${escapeHtml(fruitDescriptionText(booking) || "-")}</dd></div>
      <div><dt>รับสินค้า</dt><dd>${escapeHtml(modeLabel(booking.mode))}</dd></div>
      <div><dt>หมายเหตุ</dt><dd>${escapeHtml(booking.note || "-")}</dd></div>
    </dl>
  `;
  return card;
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

function searchableBookingText(booking) {
  return [
    booking.id,
    shortBookingId(booking.id),
    booking.bookerName,
    booking.receiverName,
    booking.receiverPhone,
    booking.receiverAddress,
    booking.note,
    booking.cfSlots.join(" "),
    fruitDescriptionText(booking),
    modeLabel(booking.mode),
  ].join(" ").toLowerCase();
}

async function deleteBooking(id) {
  if (fb.enabled && isAdmin) {
    const { deleteDoc, doc } = fb.api;
    await deleteDoc(doc(fb.db, "bookings", id));
    return;
  }

  state.bookings = state.bookings.filter((booking) => booking.id !== id);
  saveBookings();
  renderVideos();
  renderBookings();
}

async function clearAllBookings() {
  if (!state.bookings.length) return;
  if (!confirm(fb.enabled ? "ล้างรายการจองทั้งหมดจากระบบกลางหรือไม่?" : "ล้างรายการจองทั้งหมดในเครื่องนี้หรือไม่?")) return;

  if (fb.enabled && isAdmin) {
    const { collection, deleteDoc, getDocs } = fb.api;
    const snapshot = await getDocs(collection(fb.db, "bookings"));
    await Promise.all(snapshot.docs.map((docSnapshot) => deleteDoc(docSnapshot.ref)));
    state.selectedVideoIds.clear();
    syncSelectedText();
    return;
  }

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

function dropMissingSelections() {
  const existingIds = new Set(state.videos.map((item) => item.id));
  state.selectedVideoIds.forEach((id) => {
    if (!existingIds.has(id)) state.selectedVideoIds.delete(id);
  });
  els.fruitQty.value = state.selectedVideoIds.size;
}

function extractVideoNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function googleDriveVideoUrl(value) {
  const fileId = googleDriveFileId(value);
  return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : "";
}

function googleDriveFileId(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const pathMatch = text.match(/\/file\/d\/([^/?#]+)/);
  if (pathMatch) return pathMatch[1];

  const idMatch = text.match(/[?&]id=([^&#]+)/);
  if (idMatch) return idMatch[1];

  return "";
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

function shortBookingId(id) {
  return String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
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
