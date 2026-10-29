---
name: "StreamBrew"
description: "A warm coffee observatory for bright moments on stream."
colors:
  background: "#f6efe4"
  foreground: "#251820"
  card: "#fffdf8"
  card-foreground: "#251820"
  popover: "#fffdf8"
  popover-foreground: "#251820"
  primary: "#5844b8"
  primary-foreground: "#ffffff"
  secondary: "#eee5f3"
  secondary-foreground: "#57418a"
  muted: "#f4eee9"
  muted-foreground: "#70616a"
  accent: "#ffe0e5"
  accent-foreground: "#a82f53"
  border: "#e7dcd8"
  input: "#d8cbc8"
  ring: "#7962cd"
  destructive: "#d84557"
  sidebar: "#251c20"
  sidebar-foreground: "#fff8ed"
  sidebar-primary: "#edbf88"
  sidebar-primary-foreground: "#251820"
  sidebar-accent: "#3d2938"
  sidebar-accent-foreground: "#ffffff"
  sidebar-border: "#4a3442"
  sidebar-ring: "#ffbd3e"
  coffee-tab: "#3b2923"
  coffee-tab-hover: "#4a3429"
  coffee-tab-foreground: "#f2d3a8"
  coffee-tab-border: "#78563f"
  milky-paper: "#fff8ed"
  cosmic-blue: "#4056e8"
  comet-coral: "#ff647c"
  solar-mango: "#ffbd3e"
  mint-signal: "#54cfa5"
  page-header-left: "#4b3742"
  page-header-right: "#483139"
  page-header-glow: "#78608e"
  dark-background: "#191418"
  dark-foreground: "#fff8ed"
  dark-card: "#241d23"
  dark-card-foreground: "#fff8ed"
  dark-popover: "#2a1d29"
  dark-popover-foreground: "#fff8ed"
  dark-primary: "#bcabf2"
  dark-primary-foreground: "#171018"
  dark-secondary: "#393044"
  dark-secondary-foreground: "#dfe3ff"
  dark-muted: "#30232d"
  dark-muted-foreground: "#bcaeb8"
  dark-accent: "#512b3d"
  dark-accent-foreground: "#ffc8d3"
  dark-border: "#493d46"
  dark-input: "#5b4657"
  dark-ring: "#8c98ff"
  dark-destructive: "#ff7a88"
  dark-sidebar: "#120c14"
  dark-sidebar-primary: "#ffbd3e"
  dark-sidebar-accent: "#33223a"
  dark-sidebar-border: "#3d2b3d"
  dark-coffee-tab: "#493228"
  dark-coffee-tab-hover: "#573c2e"
  dark-coffee-tab-border: "#94704d"
  status-success-surface: "oklch(97.9% 0.021 166.113)"
  status-success-text: "oklch(50.8% 0.118 165.612)"
  status-success-dark-surface: "oklch(76.5% 0.177 163.223)"
  status-success-dark-text: "oklch(84.5% 0.143 164.978)"
  status-warning-surface: "oklch(98.7% 0.022 95.277)"
  status-warning-text: "oklch(55.5% 0.163 48.998)"
  status-warning-dark-surface: "oklch(82.8% 0.189 84.429)"
  status-warning-dark-text: "oklch(87.9% 0.169 91.605)"
typography:
  display:
    fontFamily: '"Bitter Variable", serif'
    fontSize: "clamp(2.75rem, 5.4vw, 4.75rem)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Bitter Variable", serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Geist Variable", sans-serif'
  label:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  compact:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.8125rem"
  caption:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.75rem"
  micro:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.6875rem"
rounded:
  sm: "0.6rem"
  md: "0.8rem"
  lg: "1rem"
  xl: "1.4rem"
  "2xl": "1.8rem"
  full: "9999px"
spacing:
  "1": "0.25rem"
  "1.5": "0.375rem"
  "2": "0.5rem"
  "2.5": "0.625rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-ghost:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-sidebar:
    textColor: "{colors.sidebar-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-destructive:
    textColor: "{colors.destructive}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  button-link:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 0.625rem"
    height: "2rem"
  input:
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
  navigation-link:
    textColor: "{colors.sidebar-foreground}"
    rounded: "{rounded.xl}"
    padding: "0 0.75rem"
  connection-status:
    backgroundColor: "{colors.status-success-surface}"
    textColor: "{colors.status-success-text}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
    typography: "{typography.micro}"
---

# Design System: StreamBrew

## Overview

**Creative North Star: “The warm coffee observatory.”** Creamy paper surrounds
plum cosmos, a cup holds a small universe, and geometric orbits suggest the wait
before a bright reaction on stream. The mood is warm, playful, and quietly
magical. Bitter gives the identity an editorial voice; Geist keeps live work clear.

Brand scenes carry the strongest atmosphere. Lists, forms, and working panels
remain calm and compact. Repeated signatures are the arched landing illustration,
coffee cup, orbital paths, and roasted-gold navigation.

This is the canonical guide for StreamBrew's visual direction and UI conventions.
Product context lives in [product context](product.md); terminology lives in the [domain glossary](glossary.md), and
[AGENTS.md](../AGENTS.md#task-guides) routes to domain behavior guides. Exact tokens and component behavior
are defined in [styles.css](../apps/web/styles.css) and the existing UI components.
The frontmatter records reusable implementation tokens; `dark-*` entries document
CSS theme overrides, not separate utilities. Keep runtime styles authoritative
when refreshing this extraction. The web app's [Impeccable sidecar](../apps/web/.impeccable/design.json)
contains component samples, shadow and motion values, and breakpoints. Its generated
tonal ramps are palette exploration aids, not additional application tokens.
Keep review evidence in the relevant review artifacts rather than in the design rules.

**Key Characteristics:**

- Warm cream and espresso surfaces with violet actions and gold navigation.
- Expressive Bitter headings paired with compact Geist controls.
- Atmospheric entry scenes and restrained working panels.

### Original associations

The design follows a coffee-and-cosmos aesthetic: coffee, galaxies, and childlike illustrations with simple lines.

Here is what the person who coined the name StreamBrew suggested:

I associate it with a black hole, coffee, a long stream, eternity, energy, a shot, speed, a queue, a row, a chain, a line, a dot, storage, a production line, and the Milky Way. Like a cup of coffee with the cosmos flowing inside it.

There is a beautiful idea in this name and in the purpose of your service.
It captures the viewer's long wait for the streamer to notice them,
and the streamer's quick glance at a video or message that sparks a vivid reaction.
Yet a stream is made of many such moments, and it lasts a long time.
It is literally coffee brewed slowly and drunk quickly.

## Colors

The palette pairs cream and espresso with observatory violet. Use semantic CSS
variables from `apps/web/styles.css` for application surfaces and controls.
Prefer semantic utilities such as `bg-background`, `bg-card`, `text-foreground`,
`text-muted-foreground`, `border-border`, `bg-secondary`, `text-primary`, and
`ring-ring`. Fixed brand, provider, alert, and status colors have named
`--color-*` tokens in `apps/web/styles.css`; use those tokens in illustrations
and brand scenes too. Charts use the `--chart-*` tokens.

- **Primary — observatory violet:** identifies actions and links; dark mode uses pale violet.
- **Navigation:** the dark coffee sidebar uses roasted gold for its primary state.
- **Neutrals:** creamy background, nearly white cards, espresso text, and warm
  borders keep data readable. Muted text uses its dedicated semantic token.
- **Illustration:** coral, mango, mint, and cosmic blue punctuate the cup and
  orbits. They also participate in the chart palette; they do not replace action
  or status semantics.
- **Dark mode:** deep plum backgrounds and raised plum surfaces use the `.dark`
  overrides. Preserve those overrides instead of hardcoding light colors.

Green communicates connected/success, amber warning, and red error or destructive
actions. Never rely on color alone. Cream text on plum brand scenes is deliberate. Functional success, warning,
error, and service colors retain their meaning and require text or icon cues.

## Typography

Use **Bitter Variable** (`font-heading`) for the wordmark, hero statements, page
titles, and prominent values. Use **Geist Variable** (`font-sans`) for navigation,
controls, body copy, lists, forms, and numbers. Both Latin and Cyrillic headings
must use the intended font.

The landing display uses the fluid frontmatter scale. Authenticated panel headings use compact 20 px type; landing section headings use 30–36 px. Body
copy is generally 14–18 px with generous leading, while compact controls use
14 px. Keep tight tracking and leading with display text. Inputs and times use
tabular numerals. Headings balance their wrapping. Capitalize both words in
`StreamBrew` in the wordmark, prose, and document titles.
Compact metadata uses the named `text-compact`, `text-caption`, and `text-micro`
tokens at 13, 12, and 11 px respectively. Register custom text sizes in
`apps/web/src/lib/utils.ts` so class merging keeps typography and text colors
independent. Display titles use the named fluid size, leading, and tracking tokens.

## Layout

Use Tailwind CSS for styling and shadcn components for UI primitives.

The landing uses a centered `max-w-6xl` container with 20 px mobile and 32 px
larger-screen side padding. Its introduction stacks on mobile and becomes two
equal columns at `lg` (1024 px). The artwork follows the copy in document order.
Feature rows form two columns from `sm` (640 px), separated by fine horizontal
rules. Broad section gaps give the entry page a slower rhythm than working pages.

Working surfaces use flex/grid, gap, and padding rather than margins wherever practical.
Keep flex children `min-w-0` and allow long names, messages, and URLs to wrap. Shared page headers have 16 px
horizontal padding, increasing to 20 px at `sm`, with 10 px vertical padding.
They reserve room for faint right-side art.
Reusable components receive external sizing and positioning of their root element
through `className` instead of hardcoding margins, width, or grow behavior internally.
Their roots may use `relative` to anchor their own absolutely positioned children;
the parent still controls offsets of the root and its placement outside normal flow.
The authenticated shell sets the height of route roots from its content wrapper.
Keep long content shrinkable and wrapping; illustrations need safe space around
copy and interactive controls at every breakpoint.

The authenticated shell places quiet working panels alongside a coffee sidebar.
Working panels have no outer padding below `sm`; at `sm` and above, use 12 px
on every side. Working pages fill the available viewport height below navigation and the development
notice, including empty and loading states. Keep the shell and panel boundaries fixed
with `h-full`, `min-h-0`, and clipped overflow; scroll long content inside each panel. Keep list filters and pagination outside
the list scroller as non-shrinking siblings so both remain visible. Video priority
filters use their own bounded scroller when needed; public queues follow the same
fixed tabs, scrolling list, and pagination layout.
Do not add a separate large page banner above a panel heading. Compact integrated
headers retain the plum scene, cream Bitter title, and subdued orbital artwork.
On desktop, multichat feed and connection columns scroll independently; on narrow
screens the panel body scrolls through the feed and connections.
On mobile, video sharing and video priority configuration sit behind a disclosure
button; video status filters remain visible in two columns. Desktop retains
the visible configuration and a right-hand filter column. Multichat puts its feed
before connection management on narrow screens, while desktop uses a connection
column beside the feed. Channel cards use a neutral border and muted surface.

The public video queue uses a centered `max-w-4xl` panel, a plum scene header,
restrained cup artwork, and compact video priority group dividers. There is no outer padding on mobile; larger screens use 12 px.

### Reading surfaces

Privacy and terms use an unboxed cream reading column capped at `max-w-3xl`,
with 20 px mobile and 32 px larger-screen side padding. The existing 36 px product
mark and faint orbital art give the header a quiet brand presence. Bitter titles
scale from 26 to 44 px and allow long words to wrap; Geist body text uses 16 px
type with 28 px leading. Fine header and footer dividers, understated purple
cross-links, and visible keyboard focus outlines complete the reading surface.

## Elevation & Depth

Tonal layering and borders provide most depth. `cosmic-panel` has no shadow.
The landing observatory uses a diffuse atmospheric shadow. Dialogs use the
framework's large shadow over a 40% black backdrop; alert cards and chat overlays
have dedicated shadows to separate them from video. Restream rails and live signals
use their named shadow tokens. Buttons are flat by default; the explicit `subtle`
elevation variant adds a small shadow. The landing sign-in action uses the default
flat treatment. Exact shadow values live in the sidecar. Plum radial gradients,
sparse starlight, and thin orbital lines establish atmospheric depth without
decorating list interiors.

## Shapes

The CSS base radius is `1rem`; `rounded-lg` uses that base, `rounded-xl` is
`1.4rem`, and `rounded-2xl` is `1.8rem`. Panels and page scenes use `rounded-2xl`;
ordinary buttons and inputs use `rounded-lg`. Compact controls also use the
smaller `sm` and `md` radii; badges and switch tracks use fully rounded ends. These are the actual custom
Tailwind mappings, not the framework's default radius values.

The signature observatory has an arched top:
`48% 48% 1rem 1rem / 28% 28% 1rem 1rem`. At desktop it tilts three degrees while
its contents counter-rotate. Circles, elliptical paths, dashed trails, and small
geometric stars connect artwork across surfaces.

## Components

At call sites, `className` may set external layout such as placement and width.
Component appearance, including padding, color, type, shape, and effects, belongs
in a named component variant. Components may style the primitives they compose
inside their own implementation.
`apps/web/src/components/ui` holds reusable visual controls and patterns, including
project-owned components. Feature-specific components remain in `apps/web/src/components`.

- **Buttons:** reuse the existing shadcn/Base UI primitive. Primary is violet,
  secondary is pale violet, and outline/ghost provide quiet actions. The default
  height is 32 px; the landing CTA explicitly grows to 48 px with 24 px horizontal
  padding. Sidebar, destructive, and link variants also exist. Primary hover
  reduces the fill to 80% opacity; secondary hover uses the accent surface.
  Keyboard focus uses a 3 px ring at 50% opacity and a ring-colored border.
  Ordinary actions translate down 1 px when pressed; popup triggers do not.
  Disabled buttons retain 50% opacity. Preserve invalid states and use the
  existing size, shape, and elevation variants.
- **Inputs:** 32 px high, semantic border, transparent light surface, and a tinted
  dark surface. Inputs and native selects use 16 px text below `md` to avoid
  mobile browser zoom; compact desktop controls retain their smaller type.
  Focus uses the ring token; invalid fields use destructive styling. The `bare`
  appearance removes borders, rounding, and the focus ring for composed controls;
  the `compact` density reduces padding and desktop text size.
- **Panels:** `cosmic-panel` combines a card surface, semantic border, and the
  custom `rounded-2xl` radius. Keep content clean and legible.
- **Connection badges:** small pill labels use 11 px bold text, 8 px horizontal
  and 2 px vertical padding, and a 6 px dot. Connected and disconnected states
  pair their respective success and warning colors with readable text. Provider
  link badges instead use a neutral border, a service icon, and a focus ring.
- **Dialogs:** rounded popover surfaces stay within the viewport with 16 px
  clearance on each side and a maximum width of 512 px. Their inner content
  scrolls, with 20 px padding increasing to 24 px at `sm`. Preserve the Base UI
  focus management and accessible title/description association.
- **Switches:** the default track is 44 × 24 px with a 20 px thumb; the small
  track is 36 × 20 px with a 16 px thumb. Checked tracks use primary fill,
  unchecked tracks use input fill, and the white thumb moves over 200 ms.
- **Navigation:** sidebar links have a 48 px minimum height and warm translucent
  selection fill with a gold border and label. On short screens, the navigation
  scrolls while account and preference controls stay reachable. Sidebar controls
  use the sidebar foreground and focus tokens. Secondary status filters use the
  existing secondary/ghost button variants with counts and accessible selection.
- **Admin tabs:** use compact 36 px horizontal links with 12 px side padding,
  16 px icons, placed inside the panel header in place of the visible title,
  without a divider. Keep the page heading available to screen readers.
  The active tab uses the `coffee-tab` tokens: espresso fill, caramel text and
  a roasted-brown border, with a lighter fill in dark mode. Match active styles
  through `data-status=active` so base link utilities cannot override them.
  Keep keyboard focus visible inside the tab's scrolling navigation row.
- **Configuration disclosures:** mobile video configuration uses a full-width
  ghost button with `aria-expanded` and `aria-controls`. Keep frequent status
  filters outside the collapsed region.
- **Panel headers:** `CosmicPageHeader` is the compact, non-shrinking header inside
  a full-height working panel. It places only a 20 px cream Bitter title on the
  shared lighter-plum `cosmic-page-scene`, with restrained orbit or bean art and
  optional actions. Do not add decorative eyebrows or descriptions beneath page
  titles. Use 10 px vertical padding, without a minimum banner height. The outer
  panel owns rounded corners and clips its internal scrollbar. Multi-panel tools,
  such as Multichat, reuse the same component with level-two headings for each
  independently named panel.
- **Landing artwork:** `CosmicArt` combines the existing `cosmic-cup.png` and
  `cosmic-cup@2x.png` rasters with geometric SVG orbits. Reuse this composition;
  it is distinct from the product mark in `assets/logo.png`.
- **States:** skeletons follow the structure of the content they replace. Empty
  and error states may use one faint contextual drawing. Keep hover, active,
  disabled, error, and `focus-visible` states visible, including on brand scenes.
- **Motion:** orbital paths use an 18-second linear cycle; the live signal pulses
  over 1.4 seconds with ease-out timing. Short hover
  movement should reinforce an arriving signal or a video moving through the queue.
  All nonessential animations and transitions collapse under
  `prefers-reduced-motion: reduce`.

### Interface icons

Application icons use `lucide-react`; do not add another icon library, inline SVG UI icons, or emoji. The StreamBrew mark and documented decorative artwork are exceptions, not replacements for UI icons.

#### Catalog and meaning

- Product code and routes import semantic icons from `apps/web/src/components/icons.tsx`, such as `Icons.wallet` or `Icons.retry`. Add an entry there instead of importing from `lucide-react` directly.
- Keep the catalog namespace import, `import * as icons from "lucide-react"`, and refer to glyphs through `icons`.
- Name entries for product meaning (`retry`, `donations`, `notWatched`), not their current glyph. Keep separate semantic aliases even when they currently point to the same glyph.
- Reuse an established semantic icon before adding a new glyph. Direct Lucide imports are only appropriate within the reusable shadcn/Base UI primitive that owns a generic control.

#### Layout and appearance

- Let the current `Button` size control inline icon size unless intentionally different. Use 15 px in compact fields and tabs, 16 px in ordinary inline controls and navigation, 18 px for small standalone actions, and 20 px for empty-state or feature icons.
- Make icon-only actions existing `Button` `icon-*` controls or equivalent focusable controls; the SVG itself is never the click target.
- Icons inherit `currentColor`; set a semantic text colour on the parent. Retain default Lucide strokes and use state or brand colour only where it communicates meaning.
- Use a parent `gap` for icon-label spacing. Avoid icon margins or absolute positioning except deliberate field decorations.

#### Accessibility

- Set `aria-hidden="true"` when visible text, the control name, or an accessible label already communicates the icon's meaning.
- Every icon-only interactive control needs an accessible name, normally `aria-label`; add a tooltip when the action may be unfamiliar, but it never replaces that name.
- Do not communicate status or selection with icon shape or colour alone. Loading icons are decorative and accompany an accessible loading or busy state.
- Preserve the parent control's hover, disabled, active, and `focus-visible` states.

### Brand assets

- Use `apps/web/assets/logo.png` for both the product mark and browser favicon.
- Keep the coffee-bean mark visually centred within its circular background. Use 36–40 px in compact navigation lockups and 48 px in the sign-in hero.
- The static logo, `CosmicArt` drawings, and Lucide interface icons have different jobs and should not be substituted for one another.

### Responsive and accessibility checks

- Verify every authenticated page, sign-in, and `/@slug/videos` at desktop and 390×844.
- Test light and dark themes, navigation, forms, loading, empty, error, success, overlays, and long content.
- Ensure there is no horizontal page overflow at 390 px, including unbroken URLs.
- Keep all decorative artwork hidden from assistive technology and ensure clipped art never covers interactive content.
- Check keyboard focus on every control, especially controls placed over `cosmic-hero` scenes.

## Do's and Don'ts

- **Do** concentrate the coffee-cosmic atmosphere in entry scenes and headers.
- **Do** keep purple actions, gold navigation, and status colors distinguishable.
- **Do** reuse the cup, orbit, and bean motifs with clear space around text.
- **Do** check translated wrapping, keyboard focus, mobile overflow, and both themes
  when extending the implementation.
- **Don't** replace working panels with heavily illustrated containers.
- **Don't** substitute decorative stars, emoji, or the logo for interface icons.
- **Don't** treat source-level theme support as evidence of visual validation.
