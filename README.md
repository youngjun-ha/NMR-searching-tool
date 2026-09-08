# NMRaid

NMRaid는 브라우저에서 1D `¹H NMR` 데이터를 읽고 용매 피크 보정, 피크 분류, 적분, 분자식 및 DBE 계산, 구조 후보 비교를 수행하는 연구용 웹 도구입니다.

분석은 기본적으로 사용자의 브라우저 안에서 실행됩니다. Bruker `1r + procs`, `fid + acqus`, JEOL/JDF, JCAMP-DX, CSV/TSV/TXT/DAT 및 ZIP·폴더 입력을 지원합니다.

## 주요 기능

- ZIP, 압축 해제 폴더, 개별 NMR 파일 입력
- Bruker 실험 폴더 자동 탐색
- 용매 피크를 가장 큰 단일 `singlet`로 분류
- 피크 구간 수동 추가와 적분값 수정
- `s`, `d`, `t`, `q`, `quint`, `sext`, `dd`, `ddd`, `dddd`, `dt`, `td`, `dq`, `tt`, `tdd`, `dtd`, `ddt`, `m` 지원
- m/z 기반 CHON 분자식 제안 및 DBE 예산 검산
- 관측 ppm·다중도·적분과 구조 후보 비교
- SciFinder, PubMed, ChemSpider 검색식 생성

## 코드 분류

| 영역 | 위치 | 역할 |
| --- | --- | --- |
| 화면 및 브라우저 분석 | `app/page.tsx` | 업로드, 파싱, 피크 분석, 적분, 분자식·DBE, 구조 후보, 차트 상호작용 |
| 스타일 | `app/globals.css` | 반응형 레이아웃과 분석 UI 스타일 |
| 문헌 검색 API | `app/api/pubmed/route.ts` | PubMed E-utilities 검색 및 입력 정제 |
| 호스팅 런타임 | `worker/index.ts`, `vite.config.ts` | 기존 Sites/Cloudflare 빌드 |
| GitHub Pages | `src/main.tsx`, `vite.github.config.ts` | 독립 정적 사이트 진입점과 빌드 |
| 검증 | `tests/`, `scripts/` | 렌더링 및 배포 산출물 검사 |
| 설계 문서 | `docs/` | 분석 흐름, 코드 지도, 입력 형식, 배포 방법 |

세부 함수별 위치는 [코드 지도](docs/CODE_MAP.md), 데이터 흐름과 판단 기준은 [아키텍처](docs/ARCHITECTURE.md)를 참고하세요.

## 로컬 실행

Node.js 22 이상이 필요합니다.

```bash
npm ci
npm run dev
```

GitHub Pages용 정적 빌드만 확인하려면 다음을 실행합니다.

```bash
npm run build:github
```

결과물은 `site-dist/`에 생성됩니다.

## GitHub Pages 배포

`.github/workflows/pages.yml`이 `main` 브랜치의 변경을 자동으로 빌드하고 Pages에 게시합니다. 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 한 번 설정하면 됩니다.

배포 주소 형식은 다음과 같습니다.

```text
https://<github-id>.github.io/NMR-searching-tool/
```

자세한 내용은 [배포 안내](docs/DEPLOYMENT.md)를 참고하세요.

## 주의

NMRaid의 구조 후보와 점수는 연구 보조용 가설입니다. 최종 구조는 `¹³C`, COSY, HSQC, HMBC, HRMS 및 표준물질 비교로 검증해야 합니다.

문의: [yjha970220@gmail.com](mailto:yjha970220@gmail.com)
