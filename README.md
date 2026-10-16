# 디오엠(DOM) 회사 홈 · 운영 포털

정밀 가공 기업 디오엠의 공개 홈페이지와 사내 운영 포털입니다.

## 제출용 링크

- GitHub 저장소: https://github.com/kjoo95/dom-mes-portal
- 회사 홈페이지: https://kjoo95.github.io/dom-mes-portal/
- 운영 포털: https://kjoo95.github.io/dom-mes-portal/portal.html

학원 평가 기간에는 운영 포털 로그인 화면을 잠시 꺼 두었습니다. 포털에 들어가면 운영 폴더를 바로 볼 수 있습니다.

## 화면 구성

- `index.html` — 공개 회사 홈 (회사소개 / 사업영역 / 오시는 길)
- `portal.html` — 사내 운영 포털 (입고, 가공, 품질, 현장, 설비 등)
- `cam-lab.html` — 가공 프로그램 화면

## 로컬에서 보기

ZIP 안에서 `index.html`을 바로 누르면 화면이 깨집니다. 반드시 압축을 푼 뒤 `open-site.bat`을 실행하세요.

```bash
python -m http.server 4173
```

- 회사 홈: http://localhost:4173
- 운영 포털: http://localhost:4173/portal.html
