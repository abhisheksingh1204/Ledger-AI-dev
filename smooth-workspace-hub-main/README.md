# Harmony AI

Build this app using the HTML files referenced below. You can hotlink the images referenced in the HTML. The attached images are screenshots of the desired screens. Here are public links to the html of the screens which you should read and use to build the app:

1. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YTUyZDEzZGFkNWQwN2M0ZTA1OWVjMDhiYWM3EgsSBxC7_6O_1BYYAZIBJAoKcHJvamVjdF9pZBIWQhQxNjAyODA0MjU3OTg4MTY3ODQyNA&filename=&opi=89354086
2. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YTUyZTZiMDNmNTIwNzNhZDYwYmIxMmMyZjVlEgsSBxC7_6O_1BYYAZIBJAoKcHJvamVjdF9pZBIWQhQxNjAyODA0MjU3OTg4MTY3ODQyNA&filename=&opi=89354086
3. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YTUyZmQxNWIxMTUwNzNhZTBiM2ZmMTljNWEwEgsSBxC7_6O_1BYYAZIBJAoKcHJvamVjdF9pZBIWQhQxNjAyODA0MjU3OTg4MTY3ODQyNA&filename=&opi=89354086
4. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YTUyZmNlNTAwMTgwMWI0ZTQwMTNmMjBmMzFmEgsSBxC7_6O_1BYYAZIBJAoKcHJvamVjdF9pZBIWQhQxNjAyODA0MjU3OTg4MTY3ODQyNA&filename=&opi=89354086
5. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YTUyZmU0NDEzZmEwMmQzYzVjMWE2MzBiMzY5EgsSBxC7_6O_1BYYAZIBJAoKcHJvamVjdF9pZBIWQhQxNjAyODA0MjU3OTg4MTY3ODQyNA&filename=&opi=89354086
6. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1YTUyZTY2ZWVmOWMwMmE5YTIyN2M3MjQ0MjlkEgsSBxC7_6O_1BYYAZIBJAoKcHJvamVjdF9pZBIWQhQxNjAyODA0MjU3OTg4MTY3ODQyNA&filename=&opi=89354086

I already have all UI screens designed.

Your task is NOT to redesign the screens.

Your task is to implement the screens exactly as provided and connect them into a functional, smooth, scrollable website/application.

IMPORTANT:

- Preserve the exact visual design of every provided screen.

- Do not change the colors, spacing, typography, card style, layout, component positions, or overall visual identity unless needed for responsiveness.

- Treat my uploaded screen designs as the source of truth.

- Focus on interaction, page flow, navigation, transitions, scrolling, routing, loading states, and responsiveness.

==================================================

SCREEN MAPPING

==================================================

I have 6 screens.

SCREEN 1 = Landing / Hero screen

SCREEN 2 = Reconciliation Agent information section

SCREEN 3 = Q&A Agent information section

SCREEN 4 = Reconciliation Agent workspace / functional application

SCREEN 5 = Loading / transition screen

SCREEN 6 = Q&A Agent workspace / functional application

==================================================

MAIN WEBSITE FLOW

==================================================

The main public website should be a single vertically scrollable experience.

The scroll order must be:

SCREEN 1

↓

SCREEN 2

↓

SCREEN 3

These should feel like sections of one continuous webpage rather than disconnected pages.

When the user opens the website, they should land on SCREEN 1.

As the user scrolls down naturally:

SCREEN 1 transitions into SCREEN 2.

Continuing to scroll:

SCREEN 2 transitions into SCREEN 3.

The user should be able to scroll back upward naturally through the same sections.

Do not require clicks to move between Screen 1, Screen 2, and Screen 3.

==================================================

SCROLL EXPERIENCE

==================================================

Make the scrolling smooth, premium, and cinematic.

Use:

- smooth vertical scrolling

- section-to-section transitions

- subtle fade-in animations

- small translateY animations

- optional parallax movement

- background image blur based on scroll position

- sticky or fixed background where appropriate

- sticky header if one exists in the design

Avoid:

- aggressive snap scrolling

- overly fast animations

- bounce effects

- excessive motion

- flashy transitions

The experience should feel elegant and controlled.

==================================================

BACKGROUND BEHAVIOR

==================================================

If the design contains a common background image:

Use the same background across the landing and informational sections.

Behavior:

At SCREEN 1:

- background is mostly sharp

- full visual impact

As the user scrolls toward SCREEN 2:

- gradually increase blur slightly

- add a subtle darker or ivory overlay if needed for readability

At SCREEN 3:

- keep the background more blurred and subdued behind dense content

The blur transition must be smooth and based on scroll progress.

Use techniques like:

- position: fixed or sticky

- backdrop-filter

- filter: blur()

- gradient overlays

- opacity interpolation

Do not blur the UI elements or text themselves.

Only blur the background layer.

==================================================

SCREEN 1 — LANDING PAGE

==================================================

SCREEN 1 is the main hero / dashboard entry screen.

It contains two major agent options:

1. Reconciliation Agent

2. Q&A Agent

The user should be able to click either agent card/button.

Interaction:

CLICK RECONCILIATION AGENT

→ show SCREEN 5 loading state

→ then navigate to SCREEN 4

CLICK Q&A AGENT

→ show SCREEN 5 loading state

→ then navigate to SCREEN 6

The transition must feel intentional and polished.

==================================================

SCREEN 5 — LOADING SCREEN

==================================================

SCREEN 5 is NOT part of the normal scroll sequence.

It is a temporary transition screen.

Use it when entering either agent workspace.

Flow:

Landing Screen

↓

User clicks an Agent

↓

SCREEN 5 appears

↓

Loading animation

↓

Agent workspace appears

Use Screen 5 for approximately:

800ms to 1500ms

Do not make it feel artificially slow.

If actual data is loading, the loading state can remain until the data is ready.

The loading animation should match the existing design.

Possible subtle animation:

- rotating loader

- pulsing logo

- progress indicator

- animated dots

- text like “Preparing workspace…”

Do not redesign Screen 5.

==================================================

RECONCILIATION FLOW

==================================================

When the user clicks the Reconciliation Agent from Screen 1:

SCREEN 1

↓ click

SCREEN 5

↓ loading

SCREEN 4

SCREEN 4 should be treated as a dedicated application workspace.

It does NOT need to remain inside the scrollable landing page.

Use routing.

Recommended URL:

/reconciliation

SCREEN 4 should behave like a real application screen.

Possible interactions based on the design:

- upload invoice file

- upload bank transaction file

- start reconciliation

- show matching results

- show ambiguous records

- show confidence scores

- show exception list

- review suspicious matches

Preserve the exact design provided in SCREEN 4.

==================================================

Q&A AGENT FLOW

==================================================

When the user clicks the Q&A Agent from Screen 1:

SCREEN 1

↓ click

SCREEN 5

↓ loading

SCREEN 6

Use routing.

Recommended URL:

/qa

SCREEN 6 should behave like a dedicated AI finance Q&A workspace.

Possible interactions based on the design:

- chat interface

- prompt input

- suggested questions

- conversation messages

- evidence / reference panel

- invoice / payment context

- loading state while AI is answering

Preserve the exact UI shown in SCREEN 6.

==================================================

IMPORTANT NAVIGATION LOGIC

==================================================

Main route:

/

Contains:

SCREEN 1

SCREEN 2

SCREEN 3

Reconciliation route:

/reconciliation

Shows:

SCREEN 4

Q&A route:

/qa

Shows:

SCREEN 6

SCREEN 5 should be used as a temporary transition/loading state when navigating to either agent.

==================================================

NAVIGATION FROM INFORMATION SECTIONS

==================================================

SCREEN 2 describes the Reconciliation Agent.

If SCREEN 2 contains a CTA such as:

- Open Agent

- Try Reconciliation

- Launch Agent

- Get Started

Clicking it should use the same flow:

SCREEN 2 CTA

↓

SCREEN 5

↓

SCREEN 4

SCREEN 3 describes the Q&A Agent.

If SCREEN 3 contains a CTA:

SCREEN 3 CTA

↓

SCREEN 5

↓

SCREEN 6

==================================================

HEADER BEHAVIOR

==================================================

If the UI contains a header/navbar:

Keep it sticky while scrolling.

Navigation behavior:

Logo

→ scroll to top / Screen 1

Overview

→ Screen 1

Reconciliation

→ smoothly scroll to Screen 2

Q&A

→ smoothly scroll to Screen 3

If there are buttons like:

Launch Workspace

Try Agent

Get Started

they should route to the appropriate agent interface.

The header may visually adapt on scroll:

- transparent at top

- slightly solid / blurred after scrolling

Do not alter its original design unnecessarily.

==================================================

SCROLL POSITION

==================================================

When navigating away from the landing page:

save or preserve the landing page scroll position if possible.

Example:

User scrolls to Screen 3

→ opens Q&A Agent

→ clicks Back

→ returns near Screen 3 rather than always returning to top

If this becomes complex, standard browser navigation behavior is acceptable.

==================================================

AGENT WORKSPACE BACK NAVIGATION

==================================================

SCREEN 4 and SCREEN 6 should contain a clear way to return to the main site.

Examples:

- logo

- back arrow

- “Back to Overview”

- home icon

Use whichever already exists in the design.

On returning:

go back to `/`

==================================================

TRANSITIONS

==================================================

Use elegant transitions.

For Screen 1 → Screen 2 → Screen 3:

- opacity fade

- translateY 20px to 0

- subtle content reveal

- 400ms–700ms easing

- stagger cards slightly

For Screen 1 → Screen 5:

- quick fade

- 200ms–300ms

For Screen 5 → Screen 4 / Screen 6:

- fade in

- optional slight scale from 0.98 to 1

- 300ms–500ms

Use easing similar to:

cubic-bezier(0.22, 1, 0.36, 1)

The transitions should feel premium and restrained.

==================================================

RESPONSIVE BEHAVIOR

==================================================

Desktop:

- preserve original designs closely

- maintain large full-screen sections

- keep horizontal card layouts

Tablet:

- adapt columns gracefully

- reduce spacing slightly

- preserve hierarchy

Mobile:

- stack cards vertically

- allow sections to expand naturally

- avoid forcing fixed viewport heights when content does not fit

- make buttons touch-friendly

- ensure text remains readable

- make tables horizontally scrollable or convert rows into cards

- keep header compact

Do not simply scale the desktop design down.

==================================================

TECHNICAL IMPLEMENTATION

==================================================

Build this as a production-quality React website.

Preferred stack:

- React

- TypeScript

- Tailwind CSS

- Framer Motion for transitions and scroll animations

- React Router or equivalent for routing

- Lucide icons only if icons are needed and not already present in the screen design

Use reusable components.

Suggested component structure:

App

├── LandingPage

│   ├── Header

│   ├── HeroSection        // Screen 1

│   ├── ReconciliationInfo // Screen 2

│   ├── QAInfo             // Screen 3

│   └── Footer

│

├── LoadingScreen          // Screen 5

│

├── ReconciliationPage    // Screen 4

│

└── QAPage                // Screen 6

==================================================

SCROLL IMPLEMENTATION

==================================================

The landing page structure should approximately be:

<LandingPage>

  <BackgroundLayer />

  <Header />

  <main>

    <section id="overview">

      SCREEN 1

    </section>

    <section id="reconciliation">

      SCREEN 2

    </section>

    <section id="qa">

      SCREEN 3

    </section>

  </main>

  <Footer />

</LandingPage>

Use IntersectionObserver or Framer Motion useScroll/useTransform for scroll effects.

Example logic:

scroll progress:

0.0 → background blur 0px

0.3 → blur 3px

0.6 → blur 6px

1.0 → blur 9px

Keep performance optimized.

Do NOT re-render the entire page on every scroll event.

==================================================

FUNCTIONALITY

==================================================

Do not make the project only a static visual mockup.

Buttons must work.

Navigation must work.

Scrolling must work.

Agent cards must work.

Loading state must work.

Back navigation must work.

Forms and inputs should be interactive.

For functionality that does not yet have a backend:

use realistic mock data and frontend behavior.

==================================================

SCREEN PRIORITY

==================================================

The visual screens I provide have highest priority.

If there is any conflict between this written description and the screenshots:

FOLLOW THE SCREENSHOTS FOR VISUAL DESIGN.

FOLLOW THIS PROMPT FOR INTERACTION AND NAVIGATION LOGIC.

Do not reinterpret or redesign the screens.

==================================================

FINAL EXPECTED EXPERIENCE

==================================================

A user opens the website.

They see SCREEN 1.

They scroll down.

SCREEN 2 appears naturally.

They continue scrolling.

SCREEN 3 appears naturally.

From SCREEN 1 or SCREEN 2:

clicking Reconciliation Agent shows SCREEN 5 and then opens SCREEN 4.

From SCREEN 1 or SCREEN 3:

clicking Q&A Agent shows SCREEN 5 and then opens SCREEN 6.

SCREEN 4 and SCREEN 6 operate as dedicated application workspaces.

The overall experience should feel:

premium,

fluid,

cohesive,

responsive,

cinematic,

and production-ready.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/181e7458-cb40-43f7-8180-d53374772e71).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
