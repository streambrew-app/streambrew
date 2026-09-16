# Donation integrations

StreamBrew connects donation sources through either OAuth or the realtime protocol behind a source's
alert widget. The provider-specific data and transport contracts live in the individual source
guides:

- [DonationAlerts](../features/donation-alerts.md)
- [donate.stream](donate-stream.md)
- [Streamlabs](streamlabs.md)
- [StreamElements](streamelements.md)
- [Tourniquet](tourniquet.md)

## Service identity in the interface

Every visible representation of a third-party donation source must show that source's official icon
next to its name. This includes integration cards, dashboard summaries, alert-source settings,
donation source badges and filters, connection results, and connection dialogs. Do not substitute
initials, a generic plug, or another platform's icon.

Keep the assets in `apps/web/assets/donation-sources` and register every supported source in
`DonationSourceIcons` in `apps/web/src/components/icons.tsx`. Prefer a first-party SVG. If the source
publishes only a raster favicon, it may be preserved inside a local SVG wrapper without redrawing or
recolouring the mark. The current assets come from each service's first-party site:

| Donation source | First-party asset                                                                      |
| --------------- | -------------------------------------------------------------------------------------- |
| DonationAlerts  | [Brand logo](https://www.donationalerts.com/img/brand/da.svg)                          |
| donate.stream   | [Favicon](https://donate.stream/favicon.png)                                           |
| Streamlabs      | [Favicon](https://cdn.streamlabs.com/static/imgs/streamlabs-logos/favicon/favicon.svg) |
| StreamElements  | [Favicon](https://streamelements.com/favicon.svg)                                      |
| Tourniquet      | [Favicon](https://tourniquet.app/images/favicon.png)                                   |

Render source identity through `DonationSourceIcon`, `DonationSourceMark`, or
`DonationSourceBadge` rather than importing an asset at an individual call site. When visible text
already names the source, the icon is decorative and uses an empty image alternative; the text
remains the accessible name. A source icon must never be the only status cue or control label.
