# GitHub Pages 배포

## 최초 한 번 설정

1. GitHub의 `nmr-searching-tool` 저장소를 엽니다.
2. **Settings → Pages**로 이동합니다.
3. **Build and deployment**의 **Source**를 **GitHub Actions**로 선택합니다.
4. `main` 브랜치에 코드가 올라가면 `Deploy NMRaid to GitHub Pages` 작업이 자동 실행됩니다.

정상 배포 후 주소는 `https://<github-id>.github.io/NMR-searching-tool/` 형식입니다. ChatGPT 로그인은 필요하지 않습니다.

## 로컬 검증

```bash
npm ci
npm run build:github
npx vite preview --outDir site-dist
```

GitHub Pages 빌드는 `GITHUB_REPOSITORY` 값을 읽어 저장소 하위 경로에 맞는 asset 주소를 자동 생성합니다.

## 기존 호스팅과의 관계

GitHub Pages 배포는 정적 브라우저 분석 화면을 제공합니다. 기존 Sites/Cloudflare 설정과 파일은 유지하므로 원본 사이트 빌드도 계속 검증할 수 있습니다.
