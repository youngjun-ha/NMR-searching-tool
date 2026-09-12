# ¹H / ¹³C 분석

기존 분석 화면 위에서 `¹H NMR` 또는 `¹³C NMR` 탭을 선택합니다. 각 탭은 스펙트럼, 용매, 보정, 확대 범위, 수동 피크, 제외 피크, 적분 기준 및 다중도 수정을 따로 보관합니다.

- 동일 시료의 ¹H·¹³C 파일을 함께 올리거나 순서대로 올릴 수 있습니다.
- Bruker/JCAMP/JDF의 핵종 메타데이터가 있으면 해당 탭으로 분류합니다. CSV 등 XY 파일은 파일명의 `13C`/`carbon` 또는 `1H`/`proton`도 인식합니다.
- 핵종 정보가 없으면 업로드 시 선택한 탭에 넣습니다. 다른 핵종은 분석하지 않습니다.
- 처음 실제 파일을 올리면 ¹H 예제가 제거되어 실제 ¹³C와 예제가 함께 분석되지 않습니다.
- `현재 탭 비우기`는 한 핵종만 제거합니다. 다른 시료로 바꿀 때는 `새 시료`로 두 입력과 m/z를 함께 비우세요.
- 같은 핵종의 여러 실험이 있으면 스펙트럼 선택 메뉴에서 하나를 선택합니다. 구조 예측에는 핵종마다 현재 선택한 한 실험만 사용합니다. 실험 선택을 바꾸면 그 핵종의 수동 수정은 초기화됩니다.

## 분석 동작

¹H는 기존 피크 분류·다중도·적분 흐름을 유지합니다. ¹³C는 탄소 ppm 영역을 분류하고 탄소 용매 신호를 제외합니다. CDCl₃ 등의 중수소 결합 용매선은 용매 영역으로 처리하고, D₂O에는 탄소 기준 신호가 없으므로 보정하지 않습니다. 용매와 시료 피크가 겹치는 영역은 검토가 필요합니다.

¹³C의 상대 면적과 다중도 수정은 확인용입니다. 일반적인 ¹³C 면적을 탄소 수 또는 수소 수로 환산하지 않으며, 구조 점수에는 탄소 ppm 영역과 메인 신호 수를 사용합니다. 신호 수는 대칭·겹침·미검출 때문에 총 탄소 수와 같지 않을 수 있습니다.

¹H만 있으면 ¹H로, ¹³C만 있으면 ¹³C로 후보를 비교합니다. 두 데이터가 있으면 두 핵종의 근거를 함께 사용합니다. 입력한 m/z와 선택한 분자식도 계속 반영됩니다. 화면의 `구조 예측` 문구에서 사용 중인 핵종을 확인할 수 있습니다.

기존의 작은 구조 비교 목록과 분자식 기반 골격 가설을 확장한 규칙 기반 기능입니다. 전체 화합물 데이터베이스 검색이나 검증된 확률 예측이 아니며, ¹³C만으로 동일 영역의 이성질체를 구별하지 못할 수 있습니다.

용매 참고: [Sigma-Aldrich NMR solvent reference](https://www.sigmaaldrich.com/US/en/technical-documents/technical-article/analytical-chemistry/nuclear-magnetic-resonance/nmr-deuterated-solvent-properties-reference), [NMR chemical shifts of impurities](https://www.sigmaaldrich.com/US/en/technical-documents/technical-article/analytical-chemistry/nuclear-magnetic-resonance/1h-nmr-and-13c-nmr-chemical-shifts-of-impurities-chart).

## 개발 파일 및 검증

- `app/page.tsx`: 핵종별 상태, 업로드 분류, 탄소 분석, 통합 후보 점수, 탭 화면.
- `app/globals.css`: 탭 및 빈 화면 스타일.
- `tests/nuclei.test.mjs`: 탄소 분석과 실제 React 업로드/탭 상태 전환 회귀 테스트.

```bash
npm ci
npm run test:nmr
npm run build:github
```

탄소 용매선 제외, D₂O/acetone 처리, ¹³C 후보 점수, 기존 ¹H 분석, 핵종 판별, 탭 수정 보존, 순차·동시 업로드를 검증합니다. 렌더링 테스트는 React 상태 전환 테스트이며 실제 브라우저 시각 검증을 대체하지 않습니다.
