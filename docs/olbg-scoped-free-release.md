# Scoped OLBG product Free policy

Separate local delta over the database-product release candidate. This does not
apply5719433, enable VERIFIED_ACCESS_REVIEW, migrate Blogabet false to unknown,
change other platforms, add UI warnings/badges, or change approved card layout.

The published OLBG product is Free on its own platform by affirmative source
policy, not because price is absent. Sources re-read18November2026:
https://www.olbg.com/best-tipsters
https://www.olbg.com/bookmakers/articles/how-use-olbg
The first says all those predictions are free; the second says its tips service
is completely free on app/web. Outside tipster businesses are outside this
classification. The product has no paid-plan field; it is not reinterpreting
contradictory stored paid flags in the unrelated legacy OLBG persistence path.

monthlyExistingRequest now admits product cards to Free and Todos, excludes
Paid, and preserves all existing platform/activity/numeric restrictions.
The monthly card mapper explicitly marks isPaid=false from that same scoped
policy. Common merge/count/sort/pagination therefore sees Free before slicing,
not as a client-side patch. Query identity already includes tipo via the
canonical baselineFilterKey, so changing Free/Todos/Paid invalidates a cursor.
Baseline SQL remains completely unchanged, including Blogabet semantics.

Three focused new tests cover affirmative policy/card mapping,123synthetic
profiles across50/50/23pages with unique identities and total123, Free/Todos
identical cards/order/count, Paid0, cross-type cursor rejection and exclusions.
18focusedtests, tsc, production build and real Next runtime smoke pass. Runtime
uses the product DB provider with global access transition flag absent. Niffler
appears identically in Todos/Free, Paid returns0; estimate and Historial remain
unchanged. No visual redesign or re-audit performed. DB product revision and
bytes do not change, and raw archive stays private.

This is prepared code, not a deployed release or authority for DB/import/flag
changes. The release still needs the explicit product import/publication grant
and independent review. Existing API audience remains unauthenticated projected
listing data, not raw capture publication.
