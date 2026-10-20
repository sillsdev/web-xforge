# Realtime gateway

The gateway is an access-control layer between every client websocket and ShareDB. It runs in addition to the
server's own access rules (sharedb-access rules in the DocServices, and the middleware in `realtime-server.ts`).
In-process server connections (the dotnet backend, migrations) do not use the websocket and do not pass through it.

The rule throughout: **everything fails closed**. Whatever cannot be decided is refused (inbound) or withheld
(outbound).

## The order a message passes through

Client to ShareDB:

1. `transport.ts` reads one websocket frame: text only, at most 5 MB, valid JSON, nested at most 32 deep, no
   `__proto__`/`constructor`/`prototype` keys, an object at the top. Frames are handled one at a time per connection.
   The socket is paused while 64 messages or 16 MB wait; a connection with 64 MB waiting is closed (1013).
2. `inbound-decoders.ts` decodes the message into one of the typed messages in `inbound-messages.ts`: exactly the
   messages the application's ShareDB client sends, with exact key sets and bounded values. Which collections exist,
   and which of them take creates, op sources, `nf` and presence, comes from the application's
   `GatewayProtocolConfig` (`scriptureforge/gateway/sf-gateway-protocol.ts`).
3. `gateway-connection.ts` handles the decoded message. The first message must be `hs`, as the client always sends it
   first; anything else first is a violation. A connection with 10,000 requests waiting for replies, or 10,000 queries,
   is closed (1013).
   - `hs`: the connection's src is settled (see src minting below).
   - Unsubscribes (`u`, `bu`, `qu`, `pu`) only need a valid shape.
   - `op`: the op's `src` is checked. A json0 op with more than 2,000 components is refused (the client's largest
     ops are far smaller, and ShareDB's transform of two such ops takes seconds).
   - Doc presence: its version must be one the connection has named or been sent for the doc, or at most 1,000 behind
     it (ShareDB reads every op since that version for each presence message).
   - `qf`/`qs`: the query registry must have an entry for the query's exact shape. The entry authorizes it and builds
     the query that is forwarded in place of the client's.
   - Everything else that names a doc, a query or a presence channel goes to the inbound authorizer.
4. `forwarded-messages.ts` rebuilds the message ShareDB receives from the typed value, never from the client's object.

ShareDB to client:

1. `transport.ts` serializes each message ShareDB writes once, in order. A connection whose queue of messages waiting
   to be authorized would pass 20,000 messages or 64 MB is closed (1013); ResourceMonitor reports the queue. No message
   leaves the queue while the websocket holds more than 16 MB not yet sent, until it is down to 4 MB, so a client that
   stops reading fills the queue rather than the websocket's buffer.
2. `outbound-decoders.ts` decodes that JSON into one of the messages in `outbound-messages.ts`.
3. `gateway-connection.ts` replaces ShareDB's `init` id with the connection's src, matches replies to the requests it
   forwarded (which also tells an op ack from an op push), drops messages for subscriptions it has ended, authorizes a
   query again (see `QueryAuthorization.isCurrent`) before more of its results go out once its authorization may be
   stale, ending it if it is refused, and asks the egress authorizer about everything else.
4. The transport sends exactly the string that was decoded, or nothing.

ShareDB's `apply` middleware (`realtime-gateway.ts`) gives the write hook every op from a gateway connection, after
ShareDB has transformed it, with the snapshot at the same version.

## The parts

**Transport** (`transport.ts`) replaces `websocket-json-stream`. A frame that breaks its rules is a protocol
violation and closes the connection. It hands ShareDB a `Duplex` stream: the socket closing ends the stream, so ShareDB
cleans up the agent, and ShareDB ending the stream closes the socket. No exception from gateway code escapes; one
closes the connection and is logged as `internal-error`.

**Decoders** (`decoder.ts`, `json.ts`, `inbound-decoders.ts`, `op-content-decoders.ts`, `outbound-decoders.ts`) are
written in-house without `any` or casts. A decoded type states exactly what was checked. Objects are read through
their own properties only, so nothing inherited is ever seen.

**Responses.** A message our client never sends (bad JSON, unknown action, extra or missing key, wrong type, value out
of range) closes the connection with 1008 and is logged. A refusal never closes: the client gets an error reply shaped
like ShareDB's own (the forwarded request plus `error`, code `ERR_GATEWAY_REFUSED`, also for ops the write hook
refuses), except for presence, which is dropped without a reply. Every refusal says only `403: Permission denied`; the
reason, which can describe a doc the user may not read, is only logged. A read of an id where no doc is stored is refused
silently (`ERR_SNAPSHOT_READ_SILENT_REJECTION`), as the server answered it with an empty snapshot before. For a
bulk request, the refused docs get their own error reply and the rest is forwarded. The refused docs among the known
results (`r`) of a query subscribe are never left out, because ShareDB and the client apply query diffs by index: they
are forwarded at the doc's current version, so that ShareDB sends nothing of them and removes them from the results;
one refused only because it was created or deleted since the client's version is forwarded with no version, so that
ShareDB sends it as it is now (which the egress authorizer decides). A well-formed query that matches
no registry entry gets an error reply (logged as `unsupported-query`), not a close, so that a missing entry cannot
cause a reconnect loop.

**Authorization interfaces** (`authorization.ts`). An application provides `GatewayPolicies`
(`gateway-application.ts`): a `QueryRegistry`, a `WriteHook`, and per connection an `InboundAuthorizer` and an
`EgressAuthorizer`, made together so that they can share state. Only requests the policies authorized can be forwarded (`ForwardableRequest` in
`gateway-connection.ts` cannot be made any other way). The provided implementations all fail closed:
`FailClosedGatewayPolicies` supports no query and refuses or withholds everything that reveals or changes a doc. A
rejected promise or thrown exception from an authorizer or the registry closes the connection as an internal error;
one from the write hook refuses the op and is logged as an internal error of the op's connection.

**Scripture Forge's policies** (`scriptureforge/gateway/`). Each collection or projection the client addresses has a
`CollectionPolicy` (`sf-collection-policies.ts`): who may read a doc (`read`, decided by the doc's own data, such as
its `projectRef`, as the server's rules do), or whatever would be at an id where no doc is (`readById`, decided by the
project the id names), who may edit it and how (`mayEdit`, `edit`), and the exact shapes clients may create (`create`).
There is no delete policy: clients never delete. A policy also lists the fields its read decision depends on
(`readDependsOn`). Membership and rights come from the project's `sf_projects` doc through `ProjectAccess`
(`project-access.ts`), which grants nothing to non-members. Projects are cached process-wide in `ProjectAccessCache`;
the cache's own `afterWrite` middleware drops a project, and moves its epoch on, when an op changes its membership,
permissions or chapter permissions (and its read epoch, which read decisions use, unless only chapter permissions
changed), and entries expire after a minute in case a change is missed. Docs are read
straight from the database adapter (`gateway-data-source.ts`), past all middleware. A doc at a past version is rebuilt
as ShareDB rebuilds it, from the latest milestone before it (ShareDB keeps milestones only for texts) and the ops
since; a rebuild that would replay more than 10,000 ops is refused.

- `SFInboundAuthorizer`: every doc a request names must be readable now; a request with a version is refused if the
  doc was created or deleted since that version, unless the user may read any doc at its id; `nf` must be readable at
  that version too. The decision for a request with a version is kept as the connection's read decision for the doc,
  since its reply has no snapshot for the egress authorizer to decide on. An op needs `mayEdit`, a create needs
  `create`. Presence is only for texts the user may read. A presence id is bound to the first connection (src) that
  uses it on any channel, held while that connection is open, and kept for its src for ten minutes after it closes, so
  that a reconnecting client keeps it; a presence message still being checked when its connection closes binds nothing.
  A viewer's name and avatar are rebuilt from their user doc (an empty name when the user has none, never the
  client's). A connection may always clear (send null) presence under an id bound to it, as it does when it leaves a
  text after losing access. A refused presence message is dropped without a reply, because the client throws on one.
- `SFWriteHook`: each op as ShareDB is about to apply it. Json0 edits are checked component by component against the
  collection's allowlist (`common/gateway/json0-edit-rules.ts`: paths, actions, value shapes, and who may), in time
  about proportional to the op; an empty edit needs the edit policy's checks of the doc too, such as reading it. Text
  edits need the texts edit right and the chapter's Paratext write permission, as the client decides it.
- `sf-query-registry.ts`: one entry per query shape the client sends. The existence check is answered for every doc,
  but built to count nothing when the user may not read the doc. An authorization that read a project stops being
  current when the project moves to a new read epoch, or after a minute.
- `SFEgressAuthorizer`: every doc a message reveals must be readable. Snapshots (in replies and query diff inserts)
  are decided on the data they reveal, except projections whose read depends on the doc, which are decided on the
  stored doc. Ops are decided by the connection's cached read decision for the doc (`read-grants.ts`), so a typing
  session needs no database reads; a create op is decided on the data it creates. A decision is made again from the
  stored doc when a project it used moves to a new epoch, when an op changes a field in `readDependsOn` (or replaces,
  creates or deletes the doc), when an op arrives above the version the decision was made at (ops were missed), and,
  for decisions that read a project, after a minute in any case. An op is decided as of the doc before it (without a
  decision at its version, the stored doc is used if no op since may have changed what reading depends on, and is
  rebuilt at that version otherwise), so the op that removes a user from a
  project still reaches them (the client relies on it); a delete, which carries no data, is sent to a connection that
  was ever allowed to read the doc; an op that changes what reading
  depends on is decided again on the fields as it leaves them, kept with the decision, without a database read, and
  if the doc is no longer readable it is sent only when it changes nothing else. A query diff with an unreadable insert is withheld and the whole query ended. `extra` is
  sent only for registry entries that say it is safe. Presence is decided by the text its channel names, and doc
  presence must name the same doc as its channel. A database error withholds without ending a doc subscription (the
  client fetches what it missed when the next op skips a version), but ends a query, as the client cannot tell that it
  missed a query diff.

**Egress.** A withheld message is dropped and logged; the subscriptions the egress authorizer names are ended on the
server and remembered, so that messages already in flight for them are dropped too. A connection remembers at most
10,000 ended subscriptions of each kind; one that would need more is closed (1011), and starts afresh when it
reconnects. A new request for a doc, or a query
that sends its snapshot, starts it afresh. If the client was waiting for the withheld message as a reply, it gets an
error reply instead (none for presence); in a bulk reply only the withheld docs get the error. A reply about something
the gateway ended while the request was in flight is withheld the same way, so the client never thinks it is subscribed
when the server sends it nothing. A withhold never closes the connection. A message ShareDB sends that does not decode
is withheld and the connection is closed (`unexpected-outbound`), since that is a surprise on the server side.

**Connection srcs** (`connection-src.ts`). The gateway issues every connection's `src` itself, as
`<nonce>.<HMAC of nonce and user id>`, with a key stored in MongoDB (`realtime_gateway_keys`). `init` is rewritten
to carry it. An `hs` asking for a src that verifies for the same user keeps it; any other `hs` gets the connection's
current src, so both handshakes the client sends on a socket get the same answer. A later `hs` asking for a different
src that verifies is a violation. An op's `src` must be the connection's src, verify for the same user, or be a ShareDB
id from before the gateway, which is bound to the first user whose op carries it (in a process-wide table that keeps
the most recent 100,000); otherwise that op gets an error reply.

**Token expiry.** The connection is closed (4001) when its access token expires. The client reconnects with a new one.

**Logging** (`gateway-event-log.ts`). Violations, refusals, withheld messages, gateway-initiated closes and internal
errors are written to the `realtime_gateway_events` collection (TTL 90 days) and to the activity log. Each connection
can write 50 entries, the connections of one user together 1 a second (50 at once), and all connections 20 a second
(200 at once), so a flood cannot fill the database and one user cannot use up the rest's share. Dropped events are
counted on the next stored one. Logging never throws.

## Known limits and decisions

- **Op history.** A user who may read a doc now may read its whole op history, such as a new project member reading
  the project's. So a past value the doc no longer shows, such as the earlier display name in a user profile, can be
  read by anyone who may read the doc now. The gateway does not address this for now.
- **Srcs from before the gateway.** Ops are still accepted with a ShareDB src from before the gateway (32 hex
  characters, unsigned), so that edits a client made offline before the deploy are not lost. Each is bound to the first
  user whose op carries it, in memory only, so the binding is lost on a restart or when the table drops it. A
  collaborator who learns such a src could therefore make those offline edits fail by using it first. This is to be
  removed once no clients from before the gateway remain.
