# CHAPTER 3

# SHARED RIDE PROJECT

This chapter describes the Shared Ride project developed during the internship. It explains the purpose of the project, the transportation problem considered, the technologies used, the user interface, the map functions, the implementation process, the present level of completion, and the learning experience gained from the work. The chapter is based on the source code, assets, configuration files, test file, and presentation found in the project workspace.

## 3.1 Project Overview

The project is named **Innovix SharedRide**, while some page titles also use the name **Innovix SmartRide**. It is a multipage frontend web application that demonstrates how passengers travelling in similar directions may share available vehicle seats. It also provides separate functions for passengers and drivers.

The main purpose shown by the project is to make ride sharing easier to understand and use. A passenger can enter a starting point, destination, and departure time, view suitable rides, examine route information on a map, and make a simulated booking. A driver can register vehicle information, offer a ride, view passenger requests, and accept or skip requests. The application attempts to address costly daily travel, difficulty finding travellers with related routes and schedules, and inefficient use of vehicle capacity.

The core application is a frontend website developed with HTML, CSS, JavaScript, and Leaflet.js. The source also confirms the use of Leaflet Routing Machine for road-route display, OpenStreetMap tiles, Nominatim geocoding, OSRM routing, Lucide icons, browser `localStorage`, and Vite as a development and build tool. One matching function can call the Google Gemini service and then merge its results with local route-matching results. Therefore, this external service is present in the prototype, although the application can fall back to its local matching logic when the request fails.

## 3.2 Background and Problem Statement

The project presentation identifies three main transportation problems. First, rising fuel prices can increase taxi fares and make daily commuting expensive. Second, public transport may be crowded and time-consuming. Third, vehicles carrying only one passenger use their available capacity inefficiently and may contribute to traffic congestion and higher fuel use.

The website responds to these problems by demonstrating a system in which passengers can search for rides and join other passengers with related routes. The source code compares locations, travel direction, route proximity, and departure time. This may reduce the difficulty of finding people who plan to travel in a similar direction. Driver pages also provide a structured way to publish vehicle and route information and to coordinate passenger requests. However, the present system is a browser-based prototype, so it does not prove that transport costs or traffic congestion have already been reduced in real operation.

## 3.3 Objectives of the Shared Ride Project

### Confirmed objectives

The files support the following objectives:

1. To allow passengers to search for available shared rides by start location, destination, and departure time.
2. To display selected locations and road routes on an interactive map.
3. To compare passenger and driver routes using local route, direction, distance, and time calculations, with an optional external matching request.
4. To display driver, vehicle, time, seat, passenger, match-score, fare, and estimated-saving information.
5. To allow registered users to create ride requests and join compatible pending requests.
6. To allow drivers to register vehicle details, offer rides, review passenger requests, and accept or skip them.
7. To demonstrate distance-based and shared-segment fare calculations.
8. To demonstrate bookings, wallet transactions, cancellations, refunds, and notifications within browser storage.
9. To provide a responsive interface for desktop and smaller screens.

### Planned or broader objectives

The presentation describes a wider vision of real-time matching, automatic pickup-point optimization, verified drivers, and a sustainable urban transport platform. These are broader product goals rather than fully completed functions. Their real-world implementation and validation require further development.

## 3.4 Target Users

The project represents three user groups.

**Passengers** can register and log in, search for driver-offered rides, select pickup and destination locations, request a ride, join another passenger's request, book an available ride, select a simulated payment method, view bookings, cancel an eligible booking or request, submit a visual rating, and use wallet screens. Passenger accounts are the default account type created by the registration page.

**Drivers** begin as registered users and can add their licence, national identification, vehicle model, plate number, and colour. After this browser-stored driver registration, they can offer rides, view offered routes and passenger requests, inspect passengers and estimated earnings, and accept or skip requests.

**General visitors** can view the landing page, its explanation of the service, the cost comparison, and navigation links. Functions involving personal rides require a local login session.

## 3.5 Main Features of the System

The following status terms are used: **fully working in the browser prototype**, **partially completed**, and **user-interface-only**. A browser-prototype feature may work locally without being a production service.

### Landing page and navigation — fully working in the browser prototype

The landing page in `index.html` introduces the service, shows a four-step process, compares bus, shared-ride, and ordinary taxi costs, and provides links to find a ride, offer a ride, log in, and register. JavaScript updates the login link to a dashboard link when a local session exists. It also opens and closes the mobile menu, changes the theme, applies entrance animation classes, and hides a timed splash screen.

### Registration and login — fully working locally, not production authentication

The passenger registration form accepts name, email, phone number, password, and password confirmation. HTML marks the fields as required, and JavaScript checks whether the passwords match and whether the password has at least six characters. `register()` and `registerUser()` create a passenger record in `localStorage` and reject a duplicate email.

The login form accepts an email address or phone number and password. JavaScript calls `login()`, displays an error modal on failure, saves the matched user as the current user on success, and redirects drivers and passengers to different dashboards. This works with browser-stored sample or registered accounts, but it is not secure server authentication because passwords and sessions are kept in `localStorage`.

### Passenger dashboard — fully working in the browser prototype

The dashboard displays the current user's name and wallet balance. It provides cards linking to find rides, offer rides, view personal rides, and manage the wallet. It also shows calculated counts for bookings, offered rides, and transactions. `requireAuth()` prevents direct use when no current local user is present.

### Ride search — partially completed

The search form in `find-ride.html` accepts a start location, destination, and required departure time. A user can type addresses or focus an input and click the map. The current-location button can fill the starting point by using browser geolocation and reverse geocoding.

On submission, JavaScript validates the text fields, tries to geocode locations if coordinates were not selected, and calls `searchRidesWithGemini()`. That function first calculates local results, optionally sends ride data to the Gemini service, and merges external and local matches. The interface displays ride cards with the driver, vehicle, plate, departure time, seats, existing passengers, route match score, distance, fare share, application fee, total price, and estimated savings. Selecting a card can highlight its map route. The feature is partial because external services and network access can fail, the key is exposed in client code, and all ride data remain local demonstration data.

### Booking and payment selection — fully working as a local simulation

A passenger can choose an available result and open a confirmation modal. The modal supports e-wallet or cash selection. `confirmBooking()` calls `db.bookRide()`, updates the local ride, booking, user, transaction, and notification records, and then redirects to personal rides. E-wallet booking checks and changes the stored balance. Cash is only a simulated choice; no payment gateway or cash collection process is integrated.

### Ride requests and shared joining — partially completed

The ride-request page contains tabs for all active requests, creating a request, and the user's requests. A passenger enters start, destination, and departure time, selects locations on the map or uses current position, views a price preview, and submits a request. The required estimated amount is deducted from the local wallet as a prepayment.

Other passengers can open a join modal, provide their own route, view a compatibility and price preview, and join if direction, pickup distance, drop-off distance, and wallet rules are satisfied. When the passenger group changes, segment-based pricing is recalculated and qualifying existing passengers receive simulated refunds. Users can leave or cancel requests under coded conditions. Drivers can accept requests, creating a new offered ride, or skip them. These interactions are substantial but remain partial because they depend on one browser's `localStorage` and do not synchronize between real users.

### Offer a ride — fully working as a local prototype

The offer form accepts a start location, destination, departure time, car model, plate number, and one to four available seats. Map selection and text geocoding are supported. JavaScript displays coordinate status, a road route, distance, and an earnings preview. It checks that the user has driver details before saving the ride. On success, `db.offerRide()` stores the route and its coordinates locally. This is not a live public offer shared across devices.

### Driver registration — fully working locally

The driver-registration page accepts driving licence number, national identification number, car model, plate number, and car colour. Required-field checking is supplied by HTML, and JavaScript updates the logged-in user and user list in `localStorage`, changes the account type to `driver`, and redirects to the offer page. Document upload, identity validation, and official verification are not implemented.

### Driver dashboard — partially completed

The driver dashboard displays driver and vehicle information, locally offered rides, map routes, passenger lists, pending requests, wallet balance, and calculated earnings. Route legend items and cards can highlight map routes. Accept and skip actions call the local database manager. The interface is functional with local data, but real driver dispatch, live passenger updates, and cross-device coordination are absent.

### Personal rides, cancellation, and rating — mixed status

The personal-rides page switches between passenger bookings and driver offers. It displays route, time, fare, payment method, vehicle, and passenger information. Eligible local bookings can be cancelled through `db.cancelBooking()`, which applies coded refund rules. The rating modal allows stars and a comment, but `submitRating()` only displays a message and closes the modal; it does not save a rating. Cancellation is therefore a working local simulation, while rating is user-interface-only.

### Wallet and transactions — partially completed simulation

The wallet page displays the balance and transaction history. It provides multi-step top-up and withdrawal modals, fixed or custom amounts, and method choices that include KBZPay-related visuals and other locally represented methods. `updateBalance()` stores simulated deposits, withdrawals, booking payments, ride-request prepayments, refunds, and driver earnings. No real bank, mobile wallet, or payment provider is connected, so the payment screens are not financial transactions.

### Theme, responsive menu, notifications, and dynamic content — fully working locally

The theme module stores light or dark mode in `localStorage`. Mobile navigation toggles an `active` class. Notification records can be created, counted, displayed, marked individually, or marked as read together. Ride cards, request cards, transaction rows, counts, map legends, price previews, and modal details are generated dynamically from JavaScript data.

## 3.6 Technologies Used

### 3.6.1 HTML

HTML provides the structure of the landing page and ten pages under `src/pages`. The files use structural elements such as `header`, `nav`, `main`, `section`, and `footer`. They define navigation links, headings, content cards, forms, labels, text and numeric inputs, date-time controls, radio inputs, text areas, buttons, modal containers, notification panels, and Leaflet map containers. IDs connect these elements to JavaScript, while classes connect them to the common stylesheet.

### 3.6.2 CSS

`src/style.css` defines the shared visual system. It contains colour variables, light and dark themes, typography, spacing, glass-style cards, buttons, forms, navigation, background effects, animations, maps, custom markers, legends, and Leaflet Routing Machine styling. It also includes hover and focus states. Media queries at 1024, 768, and 480 pixels adjust grids, navigation, typography, spacing, buttons, cards, and map heights. Several complex pages also contain page-specific CSS in their HTML files. `src/font.css` defines local MiSans Myanmar and MiSans Latin font weights, although the main stylesheet also imports external fonts.

### 3.6.3 JavaScript

JavaScript implements event handling, local authentication, validation, map selection, geocoding, route display, ride matching, pricing, booking, cancellation, wallet updates, notifications, dynamic cards, modals, responsive navigation, and theme persistence. The main reusable files are `main.js`, `auth.js`, `database.js`, `map.js`, `matching.js`, `theme.js`, and `wallet.js`. Page-specific module scripts connect these reusable functions to each page's buttons, forms, and content areas.

### 3.6.4 Leaflet.js

Leaflet.js is a JavaScript mapping library used to place interactive maps inside elements whose ID is `map`. `RideMap.init()` starts the map at Yangon coordinates **16.8661, 96.1951** with zoom level **13**. It loads tiles from OpenStreetMap with a maximum zoom of 19 and enables zoom controls, mouse-wheel zooming, and map-click events.

Custom `L.divIcon` objects distinguish start and end markers. Popup content gives the point type and address. When both points exist, Leaflet Routing Machine requests a road route from the public OSRM service. The route is displayed with a coloured line, and its coordinates are saved for later matching. If the routing plug-in is unavailable or routing fails, the code draws an animated curved fallback polyline. The class can also show several rides in different colours, fit the view to all markers, highlight one route, draw routes through waypoints, clear map layers, obtain current browser location, and correct the map size after layout changes.

Nominatim is used for forward and reverse geocoding. Network failures return `null`, and coordinate text is used after a failed reverse lookup. Warnings are written when Leaflet or routing is unavailable. Thus, markers, popups, click selection, route lines, current location, map updates, and basic fallback handling are confirmed.

## 3.7 Project Structure

The important project files are:

- `index.html` — the public landing page, service explanation, cost comparison, navigation, splash screen, and footer.
- `src/style.css` — shared layout, colour, component, animation, navigation, responsive, map, marker, and routing styles.
- `src/font.css` — local MiSans Myanmar and Latin font declarations.
- `src/main.js` — landing-page navigation state, mobile menu, animations, theme event, logout link, and splash timing.
- `src/js/auth.js` — wrappers for registration, login, logout, session checking, and page protection.
- `src/js/database.js` — browser-storage manager, sample data, external and local search, ride offers, bookings, balances, ride requests, refunds, and notifications. Despite its filename, it does not connect to a database server.
- `src/js/map.js` — Leaflet map, markers, popups, map clicks, geocoding, routing, multiple-route display, and geolocation.
- `src/js/matching.js` — distance, direction, route-corridor, time, score, grouping, waypoint, route-order, and fare calculations.
- `src/js/theme.js` — persistent light/dark theme selection.
- `src/js/wallet.js` — wallet balance, deposit, withdrawal, ride payment, receipt, and history operations over local data.
- `src/pages/login.html` and `register.html` — passenger authentication interfaces.
- `src/pages/dashboard.html` — passenger summary and quick links.
- `src/pages/find-ride.html` — ride search, map, result cards, payment selection, and booking.
- `src/pages/offer-ride.html` — driver route and vehicle form, map, preview, and saved offers.
- `src/pages/my-rides.html` — passenger bookings, driver offers, cancellation, and rating interface.
- `src/pages/wallet.html` — wallet summary, transaction list, and simulated deposit/withdrawal flows.
- `src/pages/driver-register.html` — local conversion of a passenger profile into a driver profile.
- `src/pages/driver-dashboard.html` — driver information, routes, requests, map, passengers, and earnings.
- `src/pages/ride-requests.html` — request creation, request lists, joining, acceptance, cancellation, notifications, maps, and fare previews.
- `tests/pricing.test.js` — eight automated tests for old-format and segment-based fare sharing.
- `vite.config.js` and `package.json` — multipage build configuration, commands, and declared Vite and Lucide packages.
- `public/` and `src/assets/` — logos, taxi and passenger images, decorative images, payment image, icons, and local fonts.
- `dist/` — generated production output. It is build output rather than primary editable source.
- `Innovix Smart R.pptx` — project presentation containing the problem, solution, target market, product vision, goals, and technology summary.

## 3.8 User Interface Design

The landing page uses a green visual identity, large introductory text, action buttons, explanatory cards, a price comparison, decorative backgrounds, and a responsive navigation bar. It directs visitors toward the main passenger and driver tasks.

Figure 3.1 Shared Ride Home Page

[Insert screenshot of the Shared Ride home page here.]

The ride-search page places the search form and interactive map beside the dynamically generated ride results. It uses status messages, price explanations, badges, and a booking modal to guide the passenger.

Figure 3.2 Ride Search Form and Results

[Insert screenshot of the ride search form and matching ride cards here.]

Figure 3.3 Shared Ride Search Map

[Insert screenshot of the Leaflet map with selected locations and a route here.]

The ride-request page uses tabs to separate all requests, request creation, and the user's own requests. Cards show passenger groups, routes, times, status, pricing, and role-appropriate actions.

Figure 3.4 Ride Request Page

[Insert screenshot of the ride request list and request creation interface here.]

The offer page combines a driver form, coordinate and earnings previews, and a route map. The driver dashboard uses summary cards, route maps, request cards, passenger information, vehicle details, and earnings information.

Figure 3.5 Offer Ride Page

[Insert screenshot of the offer ride form and map here.]

Figure 3.6 Driver Dashboard

[Insert screenshot of the driver dashboard here.]

The wallet page uses a balance card, action buttons, transaction history, and step-based modal panels. These controls demonstrate payment workflows but do not connect to a real payment provider.

Figure 3.7 Wallet Interface

[Insert screenshot of the wallet balance and transaction interface here.]

On screens below 768 pixels, the navigation becomes a menu panel, grids reduce their columns, controls use narrower spacing, and map height is reduced. Further adjustments are applied below 480 pixels.

## 3.9 Map Implementation Using Leaflet.js

The actual map workflow is as follows:

1. A map page loads Leaflet and Leaflet Routing Machine from external content-delivery links.
2. The page creates a `RideMap` instance for the `map` container.
3. `init()` centres the map on Yangon at latitude 16.8661 and longitude 96.1951 with zoom 13.
4. OpenStreetMap tiles are added.
5. The user focuses the start or destination input to enable map-selection mode, or types an address for Nominatim geocoding.
6. A map click records latitude and longitude and requests a readable address through reverse geocoding.
7. `setStartLocation()` or `setEndLocation()` adds a custom marker and popup and updates the input value through the page callback.
8. When both points exist, `_drawRoute()` asks OSRM for a road route through Leaflet Routing Machine.
9. The returned route is drawn and its coordinates are stored. If routing fails, `_drawFallbackRoute()` draws an animated curved polyline.
10. The map automatically fits its view around the selected locations.
11. Search and dashboard pages may add several coloured routes, fit all route markers, and highlight the route related to a selected card.

Error handling is basic but present. Missing Leaflet produces a warning, routing failure activates a fallback, failed geocoding returns no result, reverse-geocoding failure permits coordinate text, and geolocation errors are passed back to the calling page for a user message.

## 3.10 System Workflow

### Passenger workflow

Start  
↓  
Visitor opens the Shared Ride website  
↓  
Visitor registers or logs in  
↓  
Passenger opens Find Ride or Ride Requests  
↓  
Passenger enters or selects start, destination, and departure time  
↓  
The map displays markers and a route  
↓  
The system calculates local compatibility and may request external matching  
↓  
Passenger views ride, seat, driver, map, and fare information  
↓  
Passenger books a ride or creates/joins a request  
↓  
Local booking, wallet, request, and notification data are updated  
↓  
End

The passenger first creates a local account and selects a travel task. Location information may be typed, chosen on the map, or obtained from browser geolocation. The application converts locations to coordinates, displays routes, compares available rides, and calculates prices. The selected action is saved in the same browser and then shown on dashboard, personal-rides, request, or wallet pages.

### Driver workflow

Start  
↓  
User logs in and registers driver and vehicle details  
↓  
Driver offers a route or opens the driver dashboard  
↓  
Driver reviews route and passenger-request information  
↓  
Driver accepts or skips a request  
↓  
Accepted request becomes a locally stored offered ride  
↓  
End

## 3.11 JavaScript Functionality

The most important reusable functions and methods are summarized below.

- `updateNavigation()` reads the local session and changes public navigation to dashboard and logout controls. It runs after the document is ready.
- `login()` and `register()` receive form values, call the storage manager, and return success or an error. Form submit handlers call them.
- `requireAuth()` checks the current local user and redirects unauthenticated visitors. Protected pages call it during initialization.
- `initDatabase()` creates versioned sample users, rides, requests, and empty activity collections in `localStorage`. The `DatabaseManager` constructor calls it.
- `searchRidesWithGemini()` receives locations, time, and optional coordinates. It produces local matches, attempts an external matching request, normalizes the response, and merges the two result sets. The find-ride form calls it.
- `_fallbackMatch()` compares location aliases, time difference, direction, and route-corridor data. It returns locally scored and priced rides when external matching is unavailable and also supplies results for merging.
- `offerRide()` receives route, time, seat, and vehicle data, calculates distance-based price, and saves a new local ride. The offer form and accepted-request flow call it.
- `bookRide()` checks the user, ride, seats, duplicate booking, and payment conditions; it then updates stored balances, passengers, bookings, transactions, and notifications. Booking confirmation calls it.
- `createRideRequest()`, `joinRideRequest()`, `leaveRideRequest()`, `acceptRideRequest()`, and `cancelRideRequest()` manage the locally simulated request lifecycle and related pricing and refunds. Buttons and forms on request and driver pages call them.
- `calculateDistance()` uses the Haversine formula to estimate kilometres between coordinates. Pricing and matching methods call it.
- `calculateFairPriceBreakdown()` selects segment-based or older distance-based sharing and returns each passenger's fare, application charge, final price, and weight. Request creation and membership changes call it.
- `calculateMatchScore()` measures route direction, pickup and destination proximity, and time compatibility. The fallback matcher calls it.
- `init()`, `setStartLocation()`, `setEndLocation()`, `_onMapClick()`, and `_drawRoute()` create and update the map, markers, form values, and route. Page input and map events trigger them.
- `geocodeAddress()` and `_reverseGeocode()` exchange text and coordinates through Nominatim. Typed-address and map-click workflows call them.
- `toggleTheme()` changes the theme attribute and stores the choice. Theme buttons call it.
- `WalletManager` methods provide reusable balance, deposit, withdrawal, payment, receipt, and transaction-history operations over local storage. Much of the current wallet page performs equivalent updates directly through `db`.

## 3.12 Responsive Design

Responsive design is confirmed. The shared stylesheet includes breakpoints at 1024, 768, and 480 pixels. At tablet size, selected grids reduce their columns and hero text becomes smaller. At 768 pixels, the mobile menu button appears, navigation links become a positioned vertical panel, and cards, forms, map sections, and buttons adapt to the available width. The common map height changes from 450 pixels to 350 pixels, while ride map sections change from 480 pixels to 360 pixels. At 480 pixels, spacing and heading sizes reduce further and the common map height becomes 300 pixels. Flexible grids use `auto-fit` and `minmax()` in several areas. Page-specific responsive rules also adjust complex dashboard, request, and wallet layouts. Manual testing on named devices is not documented: **[Information required]**.

## 3.13 Form Validation and User Interaction

Validation uses both HTML and JavaScript. HTML supplies `required`, input types such as `email`, `tel`, `number`, and `datetime-local`, and seat limits of one to four. Registration JavaScript checks password equality and minimum length. Storage functions reject missing registration fields, duplicate email, incorrect credentials, unavailable seats, duplicate bookings, insufficient balance, invalid request status, incompatible join direction or distance, and cancellations too near departure.

Search, offer, and request pages verify empty location fields and try to obtain coordinates by map selection or geocoding. Wallet screens enforce a minimum amount of 1,000 kyats and sufficient balance for withdrawal. Success and failure are shown through modals, toasts, status text, or alerts. Button and input events control maps, previews, cards, modal steps, tabs, payment choices, theme, navigation, notifications, and logout. Error handling is useful for a prototype but is not centralized, and several messages contain mixed Burmese and English text.

## 3.14 My Contributions to the Project

The workspace confirms the project artefacts but does not identify which team member created each file. Therefore, the following statements require personal confirmation before final submission:

- I participated in developing the Shared Ride product idea. **[Confirmation required]**
- I helped identify the transport-cost and vehicle-utilization problems. **[Confirmation required]**
- I designed or implemented the HTML page structure. **[Confirmation required]**
- I styled the responsive interface and its light and dark themes with CSS. **[Confirmation required]**
- I implemented JavaScript interactions, browser storage, matching, pricing, booking, request, or wallet functions. **[Confirmation required]**
- I integrated Leaflet.js, OpenStreetMap, map markers, geocoding, and route display. **[Confirmation required]**
- I created or selected the project images and icons. **[Confirmation required]**
- I wrote and ran the pricing tests. **[Confirmation required]**
- I tested the website on desktop, mobile, and different browsers. **[Confirmation required]**
- I helped prepare `Innovix Smart R.pptx` and presented the product in a competition. **[Confirmation required]**

After confirmation, only the statements that describe my actual work should be retained.

## 3.15 Challenges and Solutions

No development diary assigns challenges to an individual. However, the code itself confirms several technical problems and implemented responses.

**Displaying a map route when routing is unavailable.** The route depends on Leaflet Routing Machine and the public OSRM service. The implementation listens for routing errors and draws a curved fallback polyline. This demonstrates the value of providing a reduced but visible alternative when a network route cannot be obtained. Whether I personally solved this challenge is **[Confirmation required]**.

**Connecting typed locations to map coordinates.** Text alone is insufficient for marker and distance calculations. The project uses Nominatim forward geocoding for typed addresses and reverse geocoding for map clicks. When reverse geocoding fails, coordinates can be shown as text. This demonstrates the relationship between interface text and geographic data. Personal responsibility is **[Confirmation required]**.

**Sharing costs for partly overlapping routes.** Equal division is not always fair when passengers travel different sections. `matching.js` constructs passenger positions along a driver route and divides each segment among active passengers. Automated tests cover full overlap, partial overlap, three staggered passengers, no overlap, empty input, and one passenger. This demonstrates the importance of breaking a complex fare problem into testable segments. Personal responsibility is **[Confirmation required]**.

**Adapting large interfaces to small screens.** Navigation, maps, cards, and multi-column dashboards need different layouts on mobile devices. Media queries, flexible grids, a mobile menu, and smaller map heights address this problem. Evidence of manual mobile testing is **[Information required]**.

**Maintaining state without a server.** The prototype needs accounts, rides, bookings, balances, and notifications despite having no backend. A versioned `localStorage` manager and sample records provide a demonstration solution. This is convenient for prototyping but cannot support secure multi-user operation.

## 3.16 Testing

The workspace contains `tests/pricing.test.js`, which uses the Node.js built-in test runner. It tests backward-compatible fare calculation and segment-based pricing for two fully overlapping passengers, partial overlap, three staggered passengers, sequential non-overlap, no passengers, and one passenger. During preparation of this chapter, all **8 tests passed**, with no failures.

No automated tests were found for navigation, forms, authentication, storage operations, booking, wallet screens, maps, geocoding, routing, browser compatibility, or responsive layouts. The existence of fallback and validation code shows defensive implementation, but it does not prove that all manual tests were completed. Records of manual map, marker, mobile, browser, and console-error testing are **[Information required]**.

## 3.17 Benefits of the Shared Ride Project

### Benefits for passengers

The project may help passengers find travel options with related routes and times, view pickup and destination points, understand the proposed route, compare fare information, and organize a trip through one interface. Shared-segment pricing demonstrates how some passengers may pay less when journey sections overlap. Actual savings depend on real routes, fares, and operation.

### Benefits for drivers

Drivers can communicate departure, route, seat, and vehicle information and review passenger requests. If developed into a production service, this could improve the use of empty seats and give drivers an opportunity to receive income from several passengers on one route.

### Benefits for the community

Grouping travellers into fewer vehicles could reduce unnecessary individual trips, improve vehicle use, and potentially reduce congestion and fuel consumption. These are expected benefits of the shared-ride model, not measured outcomes of the current prototype.

## 3.18 Current Limitations

The confirmed limitations are:

1. The system is frontend-based and has no application backend or database server.
2. Accounts, plain-text passwords, wallet values, rides, bookings, and notifications are stored in browser `localStorage`; they are not secure and are not shared between browsers or devices.
3. The client source contains an external service key, which is unsuitable for secure deployment.
4. Matching may call an external service, but availability, security, response quality, and usage control are not guaranteed. Local fallback matching is heuristic.
5. Maps, tiles, geocoding, and road routing depend on public external services and network access.
6. There is no continuous real-time GPS tracking or live driver/passenger synchronization.
7. Payments, top-ups, withdrawals, and cash selection are simulations; no real payment gateway is connected.
8. Driver details are entered locally without document upload, identity checks, or vehicle verification.
9. Ratings are not saved; the rating modal is only a user-interface demonstration.
10. There is no real-time chat, emergency support workflow, or production notification delivery.
11. Sample users, rides, requests, and passwords are included for demonstration.
12. Error handling is limited and automated tests cover pricing only.
13. The application uses public CDN resources and development/build tooling, so it is not composed only of self-contained local files at runtime.

## 3.19 Future Enhancements

All items in this section are proposed future improvements and are not presented as current features.

The prototype could be extended with a secure backend server and database, protected account registration and login, separate passenger and driver profiles, encrypted credentials, server-side validation, and synchronized ride and wallet records. Driver and passenger identity verification could improve trust. Real-time GPS updates, live route progress, secure messaging, notifications, and emergency contacts could improve coordination and safety.

A production mapping design could use controlled geocoding and routing services, calculate actual road distance and travel time, optimize multiple pickup waypoints, and handle service failures and usage limits. Matching could be evaluated against real trip data and protected behind a server rather than exposing service credentials in the browser.

Future commercial features could include a regulated payment gateway, reliable refunds, receipts, driver settlement, ratings and reviews, fraud controls, and customer support. A mobile application may also be developed after the web workflow is validated. Every enhancement would require security, privacy, legal, operational, and usability testing before real deployment.

## 3.20 Project Experience and Reflection

The Shared Ride project provided an opportunity to apply HTML and CSS knowledge to a complete multipage interface rather than a single demonstration page. The project structure shows how navigation, forms, cards, dashboards, modals, maps, and responsive rules can be combined into a consistent user experience. It also demonstrates how CSS variables, themes, animations, and media queries support visual consistency and mobile use.

The JavaScript work demonstrates how page events connect user actions to stored data and interface updates. Registration, booking, pricing, ride requests, wallet transactions, and notifications show the importance of separating reusable logic from page-specific rendering. The fare tests also show that complex business rules should be checked with several normal and edge cases.

Leaflet integration demonstrates map initialization, markers, popups, click selection, geocoding, road routing, route coordinates, and fallback lines. It also reveals the practical challenges of relying on browser permissions and network services. The project gives useful experience in turning location input into visual and calculable route data.

My personal experience of teamwork, task coordination, product-idea development, presentation preparation, public speaking, and participation in the AI Product Competition is **[Information required]**. If these activities were part of my internship, I can explain how they improved my communication, confidence, and ability to present a technical idea to an audience.

In summary, the Shared Ride project is a detailed frontend prototype that demonstrates passenger and driver workflows, interactive mapping, route matching, shared pricing, booking, wallet, and request functions. Its strongest value is as a learning and product-demonstration project. A secure backend, verified users, real payments, synchronized data, and broader testing would be necessary before it could become a real transport service.

## Project Analysis Notes

### Files inspected

The inspection covered the root HTML and configuration files; all HTML files under `src/pages`; all JavaScript files under `src` and `src/js`; `src/style.css` and `src/font.css`; `tests/pricing.test.js`; the declared dependency files; the public and source images, SVG/icon assets, and fonts; generated `dist` output; editor settings; and the text content of `Innovix Smart R.pptx`. Third-party source inside `node_modules` was identified through the manifest and package contents but was treated as installed dependency code rather than project-authored application code.

### Confirmed technologies

HTML, CSS, JavaScript modules, Leaflet.js, Leaflet Routing Machine, OpenStreetMap tiles, Nominatim geocoding, OSRM routing, browser `localStorage`, browser Geolocation, Lucide icons, Vite, Node's test runner, and an optional Google Gemini matching request are confirmed.

### Confirmed working features

Local registration and login; protected page redirection; navigation; mobile menu; theme persistence; map initialization; markers and popups; map-click selection; geocoding code; route and fallback-line code; local ride data; local fare and route calculations; ride offers; bookings; ride requests; joins, leaves, acceptance, cancellation, refunds, wallet records, and notifications; dynamic cards and summaries; and eight passing automated pricing tests are confirmed at source-code level.

### Partially implemented features

Multi-user ride sharing, external matching, real road routing, geocoding, real-time coordination, driver operations, wallet operations, and notification delivery are partial because they use one browser's data or depend on public external services.

### User-interface-only features

The saved rating system, real payment provider processing, real bank/mobile-wallet transfer, formal driver verification, and some broader presentation concepts are user-interface-only or conceptual.

### Missing information

Named team members and roles, internship dates, supervisor information, exact competition name and result, manual test records, supported browsers and devices, deployment details, user research, real operational results, measured cost reduction, and measured traffic or fuel effects are **[Information required]**.

### Details requiring my confirmation

My individual responsibility for the idea, interface, HTML, CSS, JavaScript, Leaflet integration, assets, tests, debugging, documentation, presentation, competition participation, teamwork, and public speaking is **[Confirmation required]**.
