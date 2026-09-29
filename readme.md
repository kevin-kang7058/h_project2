# 오늘의 동선 · Google 지도 연동

## 실행

- Windows에서 `start.bat`를 실행하고 브라우저로 `http://localhost:8080`에 접속하세요. Node.js가 필요하며 npm 설치나 빌드 과정은 없습니다.
- Vercel에는 정적 사이트로 배포할 수 있습니다. 프레임워크는 Other, 빌드 명령은 비워 두고 루트 폴더를 배포합니다.
- `index.html`을 직접 열어도 주소 입력·방문 목록·외부 Google 지도 길찾기·샘플 체험을 사용할 수 있습니다. 사이트 내 Google 지도와 현재 위치를 사용하려면 localhost 또는 HTTPS로 실행하세요.

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

## 샘플 체험

**샘플 주소 불러오기**는 기존 Mock Data로 화면을 체험하는 기능입니다. 샘플은 실제 주소가 아니므로 외부 길찾기를 실행하지 않습니다. 실제 주소와 샘플 주소를 섞으면 입력 안내를 표시합니다.

## 수정할 파일

- `index.html`, `route.html`: 입력·방문 목록 화면
- `css/style.css`: 공통 스타일
- `js/config.js`: Google API 키와 지도 ID
- `js/google-maps.js`: Google 지도 로딩, 주소 검색, 좌표 변환, 현위치, 길찾기 URL
- `js/main.js`: 입력 검증·검색 결과 선택·경로 확인
- `js/route.js`: 거리 정렬·목록·지도 렌더링
- `js/common.js`: 주소 정리·데이터 검증·임시 데이터 전달
- `js/mock-data.js`: 체험용 샘플 주소
- `assets/*.svg`: 간단한 SVG 이미지
- `start.bat`, `tools/server.js`: 로컬 실행 도우미 (배포 시 서버 불필요)

로그인·회원가입·DB는 연결하지 않았습니다. 입력 정보는 현재 탭의 sessionStorage로 전달하며, 파일로 직접 열 때만 window.name으로 보완합니다. 현재 위치와 좌표는 장기 보관하지 않습니다.

기존 `PROJECT_SPEC.md`의 Mock 전용·외부 API 미연결 조건은 이번 Google 지도 연동 요청에 한해 확장했습니다. 원본 명세 파일은 유지했습니다.

## 공식 문서

- [API 키와 결제 설정](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [주소 좌표 변환](https://developers.google.com/maps/documentation/javascript/geocoding)
- [Google 지도 검색·길찾기 URL](https://developers.google.com/maps/documentation/urls/get-started)
- [지도 마커](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
