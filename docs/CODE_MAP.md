# 코드 지도

현재 NMRaid의 핵심 브라우저 코드는 `app/page.tsx`에 실행 순서대로 모여 있습니다. 큰 기능 단위는 다음과 같습니다.

| 기능군 | 주요 함수·구성요소 | 설명 |
| --- | --- | --- |
| 공통 모델 | `SpectrumPoint`, `Peak`, `Candidate`, `DbePlan`, `FormulaSuggestion` | 분석 단계 사이에 전달되는 데이터 구조 |
| 피크 분석 | `analyzeSpectrum`, `inferMultiplicity`, `peakFromSelectedRange` | 노이즈 기준 피크 탐지, 다중도, 적분, 수동 구간 추가 |
| 구조 후보 | `structureCandidates`, `formulaStructureCandidates`, `comparePeakToCandidate` | 관측 신호와 구조 가설 비교 |
| 분자식·DBE | `suggestFormulas`, `dbePlanFor`, `applyDbePlan` | CHON 조합, 질량 오차, 원자가, 불포화도 예산 계산 |
| 구조 시각화 | `MolecularStructure` | 선택 분자식과 DBE 계획을 구조 카드로 표현 |
| NMR 파서 | `parseFlatBruker`, `parseBrukerFolderDatasets`, `parseStandaloneBrukerBinary`, `normalizeParsed`, `parseTextXyFile` | Bruker, JEOL/JDF, JCAMP-DX, XY 텍스트 판독 |
| 입력 안전성 | `validateInputFiles`, `filesFromDrop`, `readFileSystemHandle`, `readDroppedEntry` | 용량 제한, 빈 관리 파일 제외, 폴더 재귀 탐색 |
| 스펙트럼 UI | `SpectrumChart` | 좌·우 클릭 확대/축소, 드래그 이동, 수동 피크 범위 선택 |
| 앱 상태 | `NmrApp`, `PageErrorBoundary` | 업로드부터 결과 카드까지 전체 화면 상태와 오류 복구 |

서버 코드인 `app/api/pubmed/route.ts`는 브라우저 분석 코드와 분리되어 있으며, 외부 입력 정제와 PubMed E-utilities 호출만 담당합니다. GitHub Pages 버전에서는 앱이 생성한 공식 검색 링크를 사용하므로 서버 없이도 핵심 분석 기능이 동작합니다.
