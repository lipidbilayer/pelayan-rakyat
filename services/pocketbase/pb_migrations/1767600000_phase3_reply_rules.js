/// <reference path="../pb_data/types.d.ts" />

// Replies used to be readable as soon as the parent record was verified,
// even when the reply itself was still pending or rejected. That leaked
// rejected reply text into anonymous API responses and therefore into the
// static build. Tie the public rules to the reply's own verification status.
migrate((app) => {
  const replies = app.findCollectionByNameOrId("replies");
  const rule = "status = 'published' && verification_status = 'verified' && record.verification_status = 'verified'";
  replies.listRule = rule;
  replies.viewRule = rule;
  app.save(replies);
}, (app) => {
  const replies = app.findCollectionByNameOrId("replies");
  replies.listRule = "status = 'published' && record.verification_status = 'verified'";
  replies.viewRule = "status = 'published' && record.verification_status = 'verified'";
  app.save(replies);
});
