# Publishing Moon Pilot to the Microsoft Store

The game is an installable web app (PWA) hosted at https://surfrgames.github.io/moonpilot-play/ .
The Store accepts PWAs packaged with PWABuilder. Only the account owner can do steps 1-3 and 5.

## 1. Reserve the name (Partner Center)
1. https://partner.microsoft.com/dashboard -> Apps and games -> New product -> MSIX or PWA app.
2. Reserve **Moon Pilot** (have a backup such as "Moon Pilot: Beat the AI").
3. Open Product management -> Product identity and copy three values:
   **Package/Identity/Name**, **Package/Identity/Publisher** (starts with `CN=`), **Publisher display name**.

## 2. Build the package (PWABuilder)
1. Go to https://www.pwabuilder.com and enter `https://surfrgames.github.io/moonpilot-play/`.
2. Check the report: manifest, service worker and icons should pass. Tell Claude about any red item.
3. Package For Stores -> Windows -> paste the three values from step 1. App version `1.0.0`,
   classic package version `1.0.1`. Generate and download the zip.
4. The zip holds a `.msixbundle` and a `.classic.appxbundle`. Upload both in step 3.

## 3. Submit (Partner Center)
- **Pricing and availability:** Free, all markets.
- **Properties:** category Games -> Simulation. Privacy policy URL:
  `https://surfrgames.github.io/moonpilot-play/privacy.html`
- **Age ratings:** answer the questionnaire honestly. The game has no violence toward people, no
  purchases, no chat. It does share user-provided info publicly (the pilot name on the leaderboard).
- **Packages:** upload both bundles from step 2.
- **Store listing:** text below; screenshots from `moon-pilot/store/` (1920x1080 PNG); logo from
  `moon-pilot/brand/icon-1024.png`.
- Submit. Certification usually takes a few days; fixes are resubmitted the same way.

## Store listing text
**Name:** Moon Pilot

**Short description (under 100 characters):**
Fly a real-physics Moon rocket and out-fly an AI that taught itself to land.

**Description:**
Launch from the Moon, reach orbit, and come back down for a soft landing, with real physics:
true lunar gravity, a rocket that gets lighter as it burns fuel, and an engine you throttle by hand.

You are not flying alone. A neural network taught itself these same missions from scratch, and its
ghost flies beside you. Beat its score.

- Five ways to fly: Final Descent, Deorbit and Land, Launch to Orbit, the Full Mission, and a
  new Daily Challenge every day
- Three worlds: the Moon, icy Europa with Jupiter in the sky, and low-gravity Ceres
- Gauntlet mode: chain landings that get higher, faster and lower on fuel until one goes wrong
- A flight coach that tells you what to do next, and 15% extra score when you fly without it
- The real Moon: surface imagery and terrain from NASA's Lunar Reconnaissance Orbiter
- Worldwide leaderboard, pilot ranks, 16 achievements and daily streaks
- A Hangar of rocket colours to earn as your rank rises
- Flight graphs after every mission: your height and speed against the AI's
- Time warp up to 100x, 2D and 3D orbit maps, keyboard or touch controls
- No accounts, no ads, works offline after the first visit

**Features list (short):** Real orbital physics · Race a self-taught AI · Daily challenge ·
Gauntlet mode · Worldwide leaderboard · NASA Moon imagery

**Search terms:** moon lander, rocket, space, orbit, physics, simulator, landing, AI

**What's new (1.0):** First release.

## The Supporter Pack (how the Store version earns)
The game sells one optional add-on: a Supporter Pack that unlocks every rocket colour. It only
appears inside the app installed from the Microsoft Store (Edge 134 or newer on Windows); the
web version shows no purchase.

Set it up in Partner Center before or after the first submission:
1. Your app -> Add-ons -> Create a new add-on -> type **Durable**.
2. **Product ID: `supporter`** (exactly; the game looks for this ID).
3. Pricing: your choice. A low one-time price suits a cosmetic pack.
4. Store listing: title "Supporter Pack", description "Unlocks every rocket colour in the
   Hangar, now and in future updates, and supports the game's development."
5. Submit the add-on. It goes through certification like the app.

Not tested for real: the purchase code follows Microsoft's Digital Goods API documentation and
was exercised against a simulated Store, but a real purchase can only be tried after the app
and add-on are published. Test it once yourself and tell Claude what happens.

## After the first release
- Every web update is live for Store users at once; a new package is only needed for icon, name
  or capability changes.
- To make the app update its offline copy immediately, bump `VERSION` in `www/sw.js`.
- Ads are not built. The Supporter Pack above is the only purchase.
