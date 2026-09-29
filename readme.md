# 오늘의 동선 · Google 지도 연동

## 실행

- Windows에서 `start.bat`를 실행하고 브라우저로 `http://localhost:8080`에 접속하세요. Node.js가 필요하며 npm 설치나 빌드 과정은 없습니다.
- Vercel에는 정적 사이트로 배포할 수 있습니다. 프레임워크는 Other, 빌드 명령은 비워 두고 루트 폴더를 배포합니다.
- 인증 기능을 포함해 실행하려면 localhost 또는 HTTPS로 접속하세요. `index.html`을 파일로 직접 열면 실행 방법을 안내합니다.

## 이메일 회원가입·로그인

- 로그인하지 않은 상태에서 메인·경로 화면에 접근하면 `login.html`로 이동합니다.
- `signup.html`에서 이메일과 비밀번호로 가입합니다. 현재 Supabase 프로젝트는 이메일 인증이 필요한 설정입니다. 가입 후 인증 메일을 확인하세요.
- 로그인 성공 시 기존 `index.html`로 이동합니다. 상단에 로그인 이메일과 로그아웃 버튼이 표시됩니다.
- 새로고침 후에도 Supabase 세션을 유지하며 다른 탭의 로그인·로그아웃도 자동으로 반영합니다.
- 로그아웃하면 로그인 화면으로 이동하고, 현재 탭의 방문 정보와 현위치 좌표를 지웁니다.
- 비밀번호는 앱 코드에서 별도로 저장하지 않습니다. 인증 세션 저장·갱신은 Supabase SDK가 담당합니다.

### Supabase에서 확인할 설정

1. Authentication의 이메일 로그인과 신규 회원가입을 활성화합니다. 제공된 프로젝트는 두 설정 모두 활성화된 것을 확인했습니다.
2. Authentication → URL Configuration → Redirect URLs에 `http://localhost:8080/login.html`을 추가합니다. 배포 후에는 실제 서비스의 `https://도메인/login.html`도 등록하세요.
3. Site URL에는 실제 서비스 주소를 지정합니다. 로컬 개발 중에는 `http://localhost:8080`을 사용할 수 있습니다.
4. 실제 사용자에게 인증 메일을 발송하려면 프로젝트의 이메일 발송 설정과 발송 제한을 확인하세요.

계정 생성·메일 수신까지의 실제 가입 테스트는 사용자 이메일로 진행해야 합니다. 개발 중에는 실제 계정을 만들거나 메일을 발송하지 않고 인증 응답을 대체해 회원가입·로그인·로그아웃을 검증했습니다.

## 지금 사용할 수 있는 기능

1. 출발 주소를 직접 입력하거나 **현재 위치**를 누릅니다. 위치 권한이 거부되면 주소를 직접 입력할 수 있습니다.
2. 실제 고객 주소를 한 줄에 하나씩 입력합니다. 빈 줄은 자동 제외됩니다.
3. **경로 확인하기**를 누르면 방문 목록이 열립니다.
4. 각 고객의 **길찾기**는 입력한 출발지에서 목적지까지 Google 지도에 전달합니다.
5. **현위치에서 출발**은 Google 지도에서 기기 위치를 출발점으로 사용하도록 요청합니다. 위치를 확인할 수 없으면 Google 지도에서 출발지를 선택해야 합니다.
6. **주소 검색**에서 검색어를 입력하고 Google 지도 검색 링크로 주소를 확인할 수 있습니다. 외부 지도에서 확인한 주소는 복사해 입력란에 붙여 넣습니다.

Google API 키가 없으면 방문 목록은 **입력 순서**입니다. 확인하지 않은 좌표나 거리순 정렬을 만들어 표시하지 않습니다. 실제 경로와 이용 가능한 교통수단은 Google 지도가 제공하며, 지역과 기기에 따라 다릅니다.

## 사이트 안의 지도·주소 검색·거리순 정렬 활성화

1. Google Cloud 프로젝트에 결제 계정을 연결합니다. API 사용에는 Google 요금 정책이 적용됩니다.
2. **Maps JavaScript API**와 **Geocoding API**를 활성화합니다.
3. API 키를 만들고 웹사이트 제한에 `http://localhost:8080/*`와 실제 HTTPS 배포 도메인을 등록합니다. API 제한은 위 두 API로 설정합니다.
4. `js/config.js`의 `googleMapsApiKey`에 키를 입력합니다.
5. 운영 배포에는 JavaScript용 지도 ID를 만들고 `googleMapId`에 입력합니다. 기본 `DEMO_MAP_ID`는 테스트용입니다.
6. localhost 또는 등록한 HTTPS 주소에서 새로고침합니다.

설정 후에는 주소 검색 결과를 선택해 출발지·고객 주소에 넣을 수 있고, 직접 입력한 주소도 좌표로 변환합니다. 여러 결과나 대략적인 위치가 반환되면 주소를 더 구체적으로 입력하거나 검색 결과에서 직접 선택하도록 안내합니다. 확인되지 않은 주소는 조용히 제외하지 않습니다.

좌표가 확인된 방문지는 **출발 위치와 각 고객 사이의 직선거리**로 정렬합니다. 사이트 내부에서 도로 경로를 계산하거나 전체 방문 동선을 최적화하지는 않습니다. Google 지도 위에 출발점과 목록에 대응하는 번호를 표시합니다.

## 누락 주소 추가와 한번에 보기

- **누락 주소 추가**: 기존 주소를 지우지 않고 새 주소를 목록 마지막에 추가합니다. 방문 목록 화면에서 누르면 입력 화면으로 돌아가 추가 창이 열립니다. 추가 후 경로 확인하기 또는 한번에 보기를 눌러 반영합니다.
- **한번에 보기**: 샘플·좌표가 확인된 주소는 큰 지도 창에 출발지와 모든 방문지를 표시합니다. 지도 아래에서도 전체 주소를 확인할 수 있습니다.
- API 키가 없는 경우 **Google 지도에서 전체 보기** 링크로 출발지·경유지·목적지를 함께 전달합니다. 입력 순서를 유지하며 경로 최적화를 의미하지 않습니다.
- Google 링크의 경유지 제한에 따라 고객 주소는 PC에서 최대 10개, 모바일 브라우저에서 최대 4개까지 전달합니다. URL 길이 제한(2,048자)을 넘거나 주소 수가 많으면 안내를 표시하며, 주소를 일부 생략하지 않습니다. 일부 Google 지도 제품은 경유지를 지원하지 않을 수 있습니다. 주소 수 제한 없이 사이트 안의 한 지도에 표시하려면 API 키 설정이 필요합니다.
- 검증: `node tests/flows.js`, `node tests/browser.js` (브라우저 검증은 Windows Chrome 필요). 실제 Google 인증은 키 설정 후 별도로 확인해야 합니다.

## 샘플 체험 방법

**샘플 주소 불러오기**는 기존 Mock Data로 화면을 체험하는 기능입니다. 샘플은 실제 주소가 아니므로 외부 길찾기를 실행하지 않습니다. 실제 주소와 샘플 주소를 섞으면 입력 안내를 표시합니다.

## 수정할 파일

- `index.html`, `route.html`: 입력·방문 목록 화면
- `login.html`, `signup.html`: 로그인·회원가입 화면
- `js/auth.js`: 세션 확인, 화면 접근, 로그인 상태 변경, 로그아웃
- `js/auth-form.js`: 이메일 회원가입·로그인 폼과 오류 안내
- `js/supabase-client.js`: Supabase CDN 클라이언트 초기화
- `css/style.css`: 공통 스타일
- `js/config.js`: Google API 키와 지도 ID
- `js/google-maps.js`: Google 지도 로딩, 주소 검색, 좌표 변환, 현위치, 길찾기 URL
- `js/main.js`: 입력 검증·검색 결과 선택·경로 확인
- `js/route.js`: 거리 정렬·목록·지도 렌더링
- `js/common.js`: 주소 정리·데이터 검증·임시 데이터 전달
- `js/mock-data.js`: 체험용 샘플 주소
- `assets/*.svg`: 간단한 SVG 이미지
- `start.bat`, `tools/server.js`: 로컬 실행 도우미 (배포 시 서버 불필요)

Supabase Auth로 이메일 회원가입·로그인·로그아웃을 구현했습니다. 방문 정보의 DB 읽기 및 쓰기는 아직 구현하지 않았습니다. 방문 정보는 기존처럼 현재 탭의 sessionStorage로 전달하며 현재 위치와 좌표는 장기 보관하지 않습니다.

## Supabase 연결

- 네 화면에서 `@supabase/supabase-js` v2를 jsDelivr CDN으로 불러옵니다.
- `js/supabase-client.js`에 제공된 Project URL과 Publishable Key로 클라이언트를 생성합니다. Secret Key는 사용하지 않습니다.
- CDN 전역 객체는 `window.supabase`이며, 앱에서 사용하는 클라이언트는 `window.supabaseClient`입니다.
- CDN과 연결 파일은 `defer`로 순서대로 실행됩니다. 이후 클라이언트를 사용하는 코드는 연결 파일 뒤에 배치하거나 `DOMContentLoaded` 이후 실행하세요.
- CDN 로드에 실패하면 `window.supabaseClient`는 `null`이 되고 연결 오류와 재시도 버튼을 표시합니다.
- 세션 저장·자동 토큰 갱신·이메일 인증 링크 처리를 활성화했습니다. 기존 메인 화면 기능은 최초 세션 확인 후 초기화합니다.
- 인증 요청만 Supabase Auth로 보냅니다. 방문 정보 테이블 생성이나 DB 데이터 전송은 하지 않습니다.

기존 `PROJECT_SPEC.md`의 Mock 전용·외부 API 미연결·로그인 미구현 조건은 후속 Google 지도 및 Supabase Auth 요청에 따라 확장했습니다. 원본 명세 파일은 유지했습니다.

## 인증 검증

- `node tests/browser.js`: Chrome에서 테스트용 인증 응답으로 가입·로그인·로그아웃, 세션 복원, 다른 탭의 로그아웃, 기존 주소·지도 흐름을 확인합니다.
- `node tests/browser.js --live-auth-check`: 실제 CDN과 Supabase 비로그인 세션·공개 인증 설정을 확인합니다. 실제 계정 생성이나 메일 발송은 하지 않습니다.
- `node tests/flows.js`: 기존 경로·주소 처리 로직을 확인합니다.

## 공식 문서

- [Supabase 이메일 회원가입](https://supabase.com/docs/reference/javascript/auth-signup)
- [Supabase 인증 리디렉션 설정](https://supabase.com/docs/guides/auth/redirect-urls)

- [API 키와 결제 설정](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [주소 좌표 변환](https://developers.google.com/maps/documentation/javascript/geocoding)
- [Google 지도 검색·길찾기 URL](https://developers.google.com/maps/documentation/urls/get-started)
- [지도 마커](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
