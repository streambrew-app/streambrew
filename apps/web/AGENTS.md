# StreamBrew web application

This package owns the streamer interface, public video queues, browser-source
widgets, authentication, and the public tRPC boundary. Go services own their
domain processing; consult the root task guides when a change crosses that boundary.

Before editing TypeScript or TSX, follow the shared
[TypeScript guide](../../docs/engineering/typescript.md), including local skill loading.

Read the applicable guides before making changes:

- UI layout, styling, components, or icons: [design guide](../../docs/engineering/design.md), including
  its [interface icon rules](../../docs/engineering/design.md#interface-icons).
- React hooks or their consumers: [React guide](../../docs/engineering/react.md).
- New pages: [page conventions](../../docs/engineering/react.md#pages), including document titles.
- Route loaders, `useQuery`, or `useSuspenseQuery`: [data loading](../../docs/engineering/data-loading.md).
- Server-rendered UI, route context, browser-persisted state, or hydration:
  [SSR and hydration](../../docs/engineering/ssr-and-hydration.md).
- Localized copy, locale handling, or formatting: [internationalization](../../docs/engineering/i18n.md).
- Third-party source names or icons: [integration identity](../../docs/integrations/README.md#service-identity-in-the-interface).
