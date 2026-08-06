# 입력 파일 형식

| 형식 | 권장 입력 | 비고 |
| --- | --- | --- |
| Bruker 처리 데이터 | `1r + procs`, 가능하면 `acqus` 포함 | 정확한 ppm 축과 장비 주파수 판독 |
| Bruker 원시 데이터 | `fid + acqus` | magnitude FT 미리보기, 정량 전 위상·베이스라인 검토 필요 |
| Bruker 폴더 | 실험 폴더 전체 드래그 | `ANRE1`, `ANRE2` 등 최상위 이름과 `pdata` 구조 자동 탐색 |
| ZIP | 실험 폴더가 포함된 ZIP | 브라우저 안에서 압축 해제 후 데이터셋 분리 |
| JEOL | JDF 또는 호환 파일 묶음 | 1D 배열 또는 FID를 공통 포인트로 정규화 |
| JCAMP-DX | `.jdx`, `.dx` | 처리된 1D 스펙트럼 권장 |
| XY 텍스트 | CSV, TSV, TXT, DAT, ASC | 각 행에 ppm과 intensity 숫자 2개 이상 |

개별 `1r`이나 `fid`만 올리면 파일 자체는 읽지만 메타데이터가 없어 상대 ppm 축을 사용합니다. 정확한 분석에는 같은 실험의 `procs` 또는 `acqus`를 함께 선택하세요.
