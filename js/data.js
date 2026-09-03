export const STORAGE_KEY = "dom-mes-fresh-v1";
export const CUSTOMERS = ["참테크", "인텔릭스", "준테크놀러지", "토탈솔루션", "KEK"];
export const STAFF = [
  { id: "thswlsvy1021", name: "관리자", email: "thswlsvy1021@domeng.co.kr" },
  { id: "choi", name: "최우선", email: "choi@domeng.co.kr" },
  { id: "kim", name: "김동근", email: "kim@domeng.co.kr" },
  { id: "jo", name: "조세원", email: "jo@domeng.co.kr" },
];
export const MILL_SHOPS = ["디오엠", ...CUSTOMERS];
export const DOM_SUPPLIER = {
  name: "디오엠",
  bizNo: "124-86-65657",
  addr: "경기도평택시서탄면수월암길61-9",
  tel: "Tel;031)666-4356,Fax;031)666-4357",
  ceo: "손홍육(인)",
};

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const CNC_CHECKS = [
  "비상정지 스위치 동작 확인",
  "주축·이송축 이상음 / 진동 확인",
  "윤활유 유면 및 급유 상태",
  "절삭유 유량·농도·누유 확인",
  "공압 압력 정상 범위",
  "척 / 바이스 / 지그 고정 상태",
  "공구 파손·마모·길이 보정",
  "도어 인터록 동작",
  "칩 컨베이어 및 칩 처리",
  "오일쿨러 / 냉각기 작동",
  "작업등·표시등 점등",
  "커버·윈도우 청결",
  "원점 복귀 이상 유무",
  "주변 통로·누유·전선 정리",
];

export const EQ_MARKS = ["", "O", "X", "△", "V"];

export const EQ_ITEMS = [
  { id: "oil", no: 1, name: "절삭유", item: "절삭유농도 (%)", cycle: "1회/주(월)", kind: "text", criteria: "농도 하절기 8~12% / 동절기 7~10%" },
  { id: "estop", no: 2, name: "스위치", item: "비상정지버튼 작동유무", cycle: "1회/일", kind: "mark", criteria: "비상정지버튼 작동 유무" },
  { id: "air", no: 3, name: "공압계", item: "공압계 압력", cycle: "1회/일", kind: "text", criteria: "사용압력 0.4 ~ 0.6kg/㎠" },
  { id: "way", no: 4, name: "습동유계", item: "습동유계 게이지 현황", cycle: "1회/일", kind: "mark", criteria: "게이지 유면 L~H 사이" },
  { id: "cooler", no: 5, name: "오일쿨러", item: "오일쿨러 게이지 현황", cycle: "1회/일", kind: "mark", criteria: "게이지 유면 L~H 사이" },
  { id: "pswitch", no: 6, name: "압력 스위치", item: "압력스위치", cycle: "1회/일", kind: "text", criteria: "최대 0.35MPA" },
];

export const MACHINES = [
  { id: "long-1", group: "장축 기계", name: "장축 1호기", no: "DOMG-PR-001", model: "PCV400", process: "MCT 가공" },
  { id: "long-2", group: "장축 기계", name: "장축 2호기", no: "DOMG-PR-002", model: "PCV400", process: "MCT 가공" },
  { id: "m5-1", group: "5호기", name: "5호기-1", no: "DOMG-PR-003", model: "PCV400", process: "MCT 가공" },
  { id: "m5-2", group: "5호기", name: "5호기-2", no: "DOMG-PR-004", model: "PCV400", process: "MCT 가공" },
  { id: "m5-3", group: "5호기", name: "5호기-3", no: "DOMG-PR-005", model: "PCV400", process: "MCT 가공" },
  { id: "m5-4", group: "5호기", name: "5호기-4", no: "DOMG-PR-006", model: "PCV400", process: "MCT 가공" },
  { id: "m5-5", group: "5호기", name: "5호기-5", no: "DOMG-PR-007", model: "PCV400", process: "MCT 가공" },
  { id: "m6-1", group: "6호기", name: "6호기-1", no: "DOMG-PR-008", model: "PCV400", process: "MCT 가공" },
  { id: "m4-1", group: "4호기", name: "4호기-1", no: "DOMG-PR-009", model: "PCV400", process: "MCT 가공" },
];

export const FIVE_S_SHOP = [
  { group: "정리 정돈", items: [
    { id: "s1", label: "용도 불명의 물건이나 불필요한 자재는 없는가?" },
    { id: "s2", label: "불량품은 양품과 잘 구분되어 저장 장소에 보관하고 있는가?" },
    { id: "s3", label: "통로나 작업공간에 돌출된 장애물은 없는가?" },
    { id: "s4", label: "제품 및 자재는 식별되어 저장장소에 잘 보관되어 있는가?" },
    { id: "s5", label: "미검사품과 검사품을 식별하여 구분하고 있는가?" },
    { id: "s6", label: "적재 및 보관상태는 위험성이 없는가?" },
    { id: "s7", label: "치공구 및 주변 정리정돈 상태는 양호한가?" },
  ]},
  { group: "청소 청결", items: [
    { id: "s8", label: "바닥 청소 및 청결 유지상태는 양호한가?" },
    { id: "s9", label: "제품보관대 및 작업대 청소상태는 양호한가?" },
    { id: "s10", label: "쓰레기통은 언제나 청결하게 관리하고 있는가?" },
    { id: "s11", label: "청소용 용구는 정위치에 청결하게 보관되어 있는가?" },
  ]},
  { group: "확인 결과", items: [
    { id: "insp", label: "점검자", kind: "text" },
    { id: "conf", label: "확인", kind: "text" },
  ]},
];

export const FIVE_S_LAB = [
  { group: "정리 정돈", items: [
    { id: "l1", label: "용도 불명의 물건이나 불필요한 자재는 없는가?" },
    { id: "l2", label: "불량품은 양품과 잘 구분되어 지정 장소에 보관하고 있는가?" },
    { id: "l3", label: "통로나 작업공간에 방치된 장애물은 없는가?" },
    { id: "l4", label: "제품 및 자재는 식별되어 지정장소에 잘 보관되어 있는가?" },
    { id: "l5", label: "미검사품과 검사품이 식별되어 구분하고 있는가?" },
    { id: "l6", label: "적재 및 보관상태는 위태함이 없는가?" },
    { id: "l7", label: "치공구 및 주변 정리정돈 상태는 양호한가?" },
  ]},
  { group: "청소 청결", items: [
    { id: "l8", label: "바닥 청소 및 청결 유지상태는 양호한가?" },
    { id: "l9", label: "제품보관대 및 작업대 청소상태는 양호한가?" },
    { id: "l10", label: "쓰레기통은 언제나 청결하게 관리하고 있는가?" },
    { id: "l11", label: "청소용 도구는 정위치에 청결하게 보관되어 있는가?" },
  ]},
  { group: "확인 결과", items: [
    { id: "insp", label: "점검자", kind: "text" },
    { id: "conf", label: "확인", kind: "text" },
  ]},
];

export const QA_MEASURE_ITEMS = ["X", "Y", "Z", "홀 Ø", "홀간 거리", "챔버 모따기", "램프 깊이", "탭 깊이"];

export const FIELDS = {
  inbound: [
    { key: "date", label: "날짜", type: "date" },
    { key: "supplier", label: "업체", type: "text" },
    { key: "item", label: "자재 품명", type: "text" },
    { key: "qty", label: "개수", type: "number" },
    { key: "size", label: "자재 사이즈", type: "text" },
  ],
  process: [
    { key: "partNo", label: "품번", type: "text" },
    { key: "partName", label: "품명", type: "text" },
    { key: "lot", label: "LOT 번호", type: "text" },
    { key: "line", label: "라인", type: "text" },
    { key: "wo", label: "작업지시", type: "text" },
    { key: "startDate", label: "가공 시작일", type: "date" },
    { key: "workDate", label: "최근 작업일", type: "date" },
    { key: "endDate", label: "완료일", type: "date" },
    { key: "progress", label: "진행률(%)", type: "number" },
    { key: "planQty", label: "계획 수량", type: "number" },
    { key: "doneQty", label: "가공 완료 수량", type: "number" },
    { key: "detail", label: "완료 상세", type: "textarea" },
    { key: "owner", label: "담당", type: "text" },
    { key: "status", label: "상태", type: "text" },
  ],
  delivery: [
    { key: "date", label: "일자", type: "date" },
    { key: "customer", label: "공급받는자", type: "text" },
    { key: "partNo", label: "품번", type: "text" },
    { key: "partName", label: "품명", type: "text" },
    { key: "unit", label: "단위", type: "text" },
    { key: "qty", label: "수량", type: "number" },
    { key: "price", label: "단가", type: "number" },
    { key: "note", label: "비고", type: "text" },
  ],
  quality: [
    { key: "date", label: "검사일", type: "date" },
    { key: "millCompany", label: "가공 회사", type: "select", options: MILL_SHOPS },
    { key: "customer", label: "납품처", type: "text" },
    { key: "partNo", label: "품번", type: "text" },
    { key: "partName", label: "품명", type: "text" },
    { key: "lot", label: "LOT 번호", type: "text" },
    { key: "qtyIn", label: "품질실 입고 수량", type: "number" },
    { key: "qtyOut", label: "납품 출고 수량", type: "number" },
    { key: "inspector", label: "검사자", type: "text" },
    { key: "status", label: "판정", type: "select", options: ["합격", "불합격", "보류"] },
  ],
  defect: [
    { key: "date", label: "발생일", type: "date" },
    { key: "partNo", label: "품번", type: "text" },
    { key: "partName", label: "품명", type: "text" },
    { key: "lot", label: "LOT 번호", type: "text" },
    { key: "type", label: "불량 유형", type: "text" },
    { key: "qty", label: "수량", type: "number" },
    { key: "action", label: "수정 조치", type: "textarea" },
    { key: "prevent", label: "재발 방지 대책", type: "textarea" },
    { key: "status", label: "상태", type: "text" },
  ],
  inventory: [
    { key: "date", label: "기준일", type: "date" },
    { key: "kind", label: "구분", type: "text" },
    { key: "item", label: "품명", type: "text" },
    { key: "lot", label: "LOT 번호", type: "text" },
    { key: "qty", label: "재고 개수", type: "number" },
    { key: "location", label: "위치", type: "text" },
    { key: "status", label: "상태", type: "text" },
  ],
  climatePoint: [
    { key: "name", label: "위치 이름", type: "text" },
    { key: "temp", label: "온도(°C)", type: "number" },
    { key: "humidity", label: "습도(%)", type: "number" },
    { key: "lux", label: "조도(lx)", type: "number" },
    { key: "status", label: "상태", type: "text" },
  ],
  custom: [
    { key: "date", label: "날짜", type: "date" },
    { key: "item", label: "항목", type: "text" },
    { key: "detail", label: "내용", type: "textarea" },
    { key: "owner", label: "담당", type: "text" },
    { key: "status", label: "상태", type: "text" },
  ],
};

export function fieldsFor(type, compact = false) {
  const all = FIELDS[type] || FIELDS.custom;
  if (!compact) return all;
  const keys = {
    inbound: ["date", "supplier", "item", "qty", "size"],
    process: ["partNo", "partName", "planQty", "doneQty", "progress", "status"],
    delivery: ["customer", "partNo", "partName", "qty"],
    quality: ["partNo", "partName", "inspector", "status"],
    defect: ["partName", "type", "qty", "status"],
    inventory: ["item", "lot", "qty", "status"],
    custom: ["item", "owner", "status"],
  }[type];
  if (!keys) return all.slice(0, 5);
  return all.filter((f) => keys.includes(f.key));
}

export function flattenChecks(groups) {
  return groups.flatMap((g) => g.items.filter((item) => item.kind !== "text"));
}

export function badgeClass(value) {
  const text = String(value ?? "");
  if (["불합격", "폐기", "미결", "주의", "미달", "일부 미입고"].includes(text)) return "bad";
  if (["보류", "대기", "가동", "출하준비", "예정"].includes(text)) return "warn";
  return "ok";
}

export function defaultState() {
  const today = todayISO();
  return {
    modules: [
      { id: "records", title: "기록 관리", desc: "각 폴더에서 저장한 기록을 한곳에서 찾아 봅니다.", type: "records" },
      { id: "chat", title: "사내 메신저", desc: "카카오톡처럼 현장·검사실·개인 대화를 나눕니다.", type: "chat" },
      { id: "mail", title: "후이즈 메일", desc: "새 창에서 후이즈 웹메일을 엽니다.", type: "mail" },
      { id: "inbound", title: "원자재 입고 관리", desc: "월 폴더에 A4 한 장으로 적습니다. 날짜, 업체, 자재 품명, 개수, 자재 사이즈 순입니다.", type: "inbound" },
      { id: "process", title: "가공 현황", desc: "품번·품명·날짜별 완료 수량을 관리합니다.", type: "process" },
      { id: "delivery", title: "거래명세표", desc: "날짜별 거래명세표에 그날 나가는 품목을 적고 한 장으로 인쇄합니다.", type: "delivery" },
      { id: "quality", title: "품질 관리 현황", desc: "사진과 치수·비고를 성적서 한 장에 기록하고 인쇄합니다.", type: "quality" },
      { id: "climate", title: "현장 온습도 관리", desc: "월 목록에서 해당 달 온·습도 표를 열고 일자별로 적습니다.", type: "climate" },
      { id: "five-s", title: "현장 3정5S 관리", desc: "월 목록에서 해당 달 3정 5S 표를 열고 일자별로 체크합니다.", type: "five-s" },
      { id: "lab-climate", title: "검사실 온습도 관리", desc: "월 목록에서 해당 달 완제품 창고 온·습도 표를 열고 일자별로 적습니다.", type: "lab-climate" },
      { id: "lab-5s", title: "검사실 3정5S 관리", desc: "월 목록에서 해당 달 3정 5S 표를 열고 일자별로 체크합니다.", type: "lab-5s" },
      { id: "defect", title: "불량품 관리 현황", desc: "외관 사진과 재발 방지 대책을 남깁니다.", type: "defect" },
      { id: "inventory", title: "재고 현황", desc: "재고 개수와 LOT 번호를 기입합니다.", type: "inventory" },
      { id: "equipment", title: "설비 점검", desc: "설비일상점검표를 연·월을 바꿔 가며 작성하고 인쇄합니다.", type: "equipment" },
      { id: "mastercam", title: "Mastercam 9.1 프로그램", desc: "업체를 연 뒤 프로그램을 넣으면 들어온 날이 자동으로 적힙니다.", type: "mastercam" },
    ],
    dateFolders: {},
    records: {
      inbound: [
        { id: "in-1", date: today, month: today.slice(0, 7), supplier: "천명스텐레스", item: "SUS304 환봉", size: "Ø50 × 3000", qty: 12 },
        { id: "in-2", date: today, month: today.slice(0, 7), supplier: "기흥금속", item: "알루미늄 6061 판재", size: "20 × 100 × 2000", qty: 8 },
        { id: "in-3", date: "2026-09-01", month: "2026-09", supplier: "천명스텐레스", item: "SUS316 파이프", size: "Ø34 × 6000", qty: 6 },
      ],
      process: [
        { id: "pr-1", partNo: "DOM-HSG-032", partName: "모터 하우징", lot: "LOT-P-8841", line: "장축 1호기", wo: "WO-8841", startDate: "2026-08-28", workDate: today, endDate: "", progress: 82, planQty: 320, doneQty: 262, detail: "08-28 80개, 08-29 70개, 09-01 72개, 09-02 40개.", owner: "최우선", status: "가동" },
        { id: "pr-2", partNo: "DOM-SFT-018", partName: "샤프트", lot: "LOT-P-8847", line: "5호기-1", wo: "WO-8847", startDate: "2026-09-01", workDate: today, endDate: "", progress: 46, planQty: 1000, doneQty: 460, detail: "09-01 선삭 220개, 09-02 선삭 240개.", owner: "김동근", status: "가동" },
        { id: "pr-3", partNo: "DOM-FLN-A01", partName: "플랜지", lot: "LOT-P-8850", line: "6호기-1", wo: "WO-8850", startDate: "2026-08-25", workDate: "2026-09-01", endDate: "2026-09-01", progress: 100, planQty: 240, doneQty: 240, detail: "전량 밀링 완료.", owner: "조세원", status: "완료" },
      ],
      delivery: [
        { id: "dl-1", date: today, customer: "참테크", partNo: "DOM-HSG-032", partName: "하우징", unit: "EA", qty: 80, price: "", note: "" },
        { id: "dl-1b", date: today, customer: "인텔릭스", partNo: "DOM-SFT-018", partName: "샤프트", unit: "EA", qty: 40, price: "", note: "" },
        { id: "dl-2", date: "2026-09-04", customer: "인텔릭스", partNo: "DOM-SFT-018", partName: "샤프트", unit: "EA", qty: 200, price: "", note: "" },
        { id: "dl-3", date: "2026-09-05", customer: "준테크놀러지", partNo: "DOM-FLN-A01", partName: "플랜지", unit: "EA", qty: 120, price: "", note: "" },
      ],
      quality: [
        { id: "qa-1", date: today, millCompany: "디오엠", customer: "참테크", partNo: "DOM-HSG-032", partName: "모터 하우징", lot: "LOT-P-8841", qtyIn: 80, qtyOut: 76, inspector: "조세원", status: "합격", photos: [], measures: [
          { item: "X", spec: "120.00±0.05", v1: "120.01", v2: "119.99", v3: "120.00", note: "" },
          { item: "Y", spec: "80.00±0.05", v1: "80.00", v2: "80.02", v3: "79.98", note: "" },
          { item: "Z", spec: "32.00±0.02", v1: "32.00", v2: "31.99", v3: "32.01", note: "" },
        ] },
      ],
      defect: [
        { id: "df-1", date: today, partNo: "DOM-SFT-018", partName: "샤프트", lot: "LOT-P-8847", type: "외관 스크래치", qty: 4, action: "해당 LOT 선별 후 재연마", prevent: "방진 커버 장착 후 이송", status: "조치완료", photos: [] },
      ],
      inventory: [
        { id: "iv-1", date: today, kind: "원자재", item: "SUS304 환봉", lot: "LOT-TM-260902-01", qty: 36, location: "W-A01", status: "정상" },
        { id: "iv-2", date: today, kind: "완제품", item: "플랜지", lot: "LOT-P-8850", qty: 240, location: "W-C01", status: "정상" },
      ],
    },
    deliveryMeta: {},
    climate: {
      rooms: [
        { id: "store-a", name: "원자재 창고", x: 3, y: 4, w: 34, h: 28, kind: "area" },
        { id: "store-b", name: "완제품 창고", x: 40, y: 4, w: 28, h: 28, kind: "area" },
        { id: "hall", name: "통로", x: 36, y: 36, w: 12, h: 38, kind: "hall" },
        { id: "qa", name: "검사실", x: 76, y: 4, w: 21, h: 50, kind: "qa" },
        { id: "ship", name: "출하장", x: 3, y: 78, w: 94, h: 18, kind: "area" },
        { id: "m-long-1", name: "장축 1호기", x: 5, y: 42, w: 14, h: 16, kind: "machine" },
        { id: "m-long-2", name: "장축 2호기", x: 20, y: 42, w: 14, h: 16, kind: "machine" },
        { id: "m-5-1", name: "5호기-1", x: 50, y: 40, w: 12, h: 14, kind: "machine" },
        { id: "m-5-2", name: "5호기-2", x: 63, y: 40, w: 12, h: 14, kind: "machine" },
        { id: "m-6", name: "6호기", x: 50, y: 56, w: 12, h: 14, kind: "machine" },
        { id: "m-4", name: "4호기", x: 63, y: 56, w: 12, h: 14, kind: "machine" },
      ],
      points: [
        { id: "P1", name: "가공장 A", x: 22, y: 58 },
        { id: "P2", name: "가공장 B", x: 56, y: 50 },
        { id: "P3", name: "원자재 창고", x: 20, y: 18 },
        { id: "P4", name: "완제품 창고", x: 54, y: 18 },
        { id: "P5", name: "검사실", x: 86, y: 28 },
        { id: "P6", name: "출하장", x: 50, y: 86 },
      ],
      logs: {
        [today]: [
          { pointId: "P1", temp: 23.1, humidity: 48, lux: 520, status: "정상" },
          { pointId: "P2", temp: 24.8, humidity: 52, lux: 480, status: "정상" },
          { pointId: "P3", temp: 21.4, humidity: 61, lux: 210, status: "주의" },
          { pointId: "P4", temp: 22.0, humidity: 45, lux: 250, status: "정상" },
          { pointId: "P5", temp: 22.6, humidity: 47, lux: 610, status: "정상" },
          { pointId: "P6", temp: 23.4, humidity: 50, lux: 390, status: "정상" },
        ],
      },
      checks: {
        [today]: { P1: true, P2: true, P3: true, P4: true, P5: true, P6: true },
      },
      sheet: {},
    },
    fiveS: {
      dates: {
        [today]: {
          shop: { s1: true, s2: true, s3: true, s7: true, s8: true },
          lab: { l1: true, l2: true, l6: true, l8: true, l12: true },
        },
      },
      notes: {},
      labNotes: {},
    },
    labClimate: {
      rooms: [
        { id: "lab-bench", name: "검사대", x: 6, y: 8, w: 48, h: 42, kind: "qa" },
        { id: "lab-plate", name: "정반", x: 58, y: 8, w: 36, h: 28, kind: "area" },
        { id: "lab-gage", name: "게이지 보관", x: 6, y: 56, w: 28, h: 36, kind: "area" },
        { id: "lab-wait", name: "시료 대기", x: 38, y: 56, w: 28, h: 36, kind: "area" },
        { id: "lab-door", name: "출입", x: 70, y: 56, w: 24, h: 36, kind: "hall" },
      ],
      points: [
        { id: "L1", name: "검사대", x: 28, y: 28 },
        { id: "L2", name: "정반", x: 76, y: 22 },
        { id: "L3", name: "게이지 보관", x: 20, y: 72 },
        { id: "L4", name: "시료 대기", x: 52, y: 72 },
      ],
      logs: {
        [today]: [
          { pointId: "L1", temp: 22.6, humidity: 47, lux: 610, status: "정상" },
          { pointId: "L2", temp: 22.4, humidity: 46, lux: 580, status: "정상" },
          { pointId: "L3", temp: 22.8, humidity: 48, lux: 420, status: "정상" },
          { pointId: "L4", temp: 23.0, humidity: 49, lux: 390, status: "정상" },
        ],
      },
      checks: {
        [today]: { L1: true, L2: true, L3: true, L4: true },
      },
      sheet: {},
    },
    equipment: {},
    eqPhotos: {},
    chat: {
      messages: [
        { id: "c1", room: "all", from: "choi", name: "최우선", text: "오늘 장축 1호기 하우징 우선입니다.", at: Date.now() - 3600000 },
        { id: "c2", room: "lab", from: "jo", name: "조세원", text: "품질실 입고 80개 검사 들어왔습니다.", at: Date.now() - 1800000 },
      ],
    },
    mail: {
      address: "harry@domeng.co.kr",
      web: "https://email.whois.co.kr/v2/",
      drafts: [],
    },
    camFolder: "cam-root",
    cam: {
      folders: [
        { id: "cam-root", name: "Mastercam 9.1", parent: null },
        { id: "cam-cham", name: "참테크", parent: "cam-root" },
        { id: "cam-intel", name: "인텔릭스", parent: "cam-root" },
        { id: "cam-june", name: "준테크놀러지", parent: "cam-root" },
        { id: "cam-total", name: "토탈솔루션", parent: "cam-root" },
        { id: "cam-kek", name: "KEK", parent: "cam-root" },
      ],
      files: [],
      jobs: [],
    },
  };
}
