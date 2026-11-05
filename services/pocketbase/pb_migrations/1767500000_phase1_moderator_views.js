/// <reference path="../pb_data/types.d.ts" />

const MODERATOR_RULE = "@request.auth.role = 'moderator' || @request.auth.role = 'admin'";

migrate((app) => {
  const view = new Collection({ type: "view", name: "people_notes", viewQuery: "SELECT id, notes FROM people" });
  view.listRule = MODERATOR_RULE;
  view.viewRule = MODERATOR_RULE;
  view.createRule = null;
  view.updateRule = null;
  view.deleteRule = null;
  const notesField = view.fields.getByName("notes");
  if (notesField) notesField.setHidden(false);
  const rejectionField = view.fields.getByName("rejection_reason");
  if (rejectionField) rejectionField.setHidden(false);
  app.save(view);

  const posView = new Collection({ type: "view", name: "position_notes", viewQuery: "SELECT id, notes, rejection_reason FROM positions" });
  posView.listRule = MODERATOR_RULE;
  posView.viewRule = MODERATOR_RULE;
  posView.createRule = null;
  posView.updateRule = null;
  posView.deleteRule = null;
  const posNotesField = posView.fields.getByName("notes");
  if (posNotesField) posNotesField.setHidden(false);
  const posRejectionField = posView.fields.getByName("rejection_reason");
  if (posRejectionField) posRejectionField.setHidden(false);
  app.save(posView);
}, (app) => {
  for (const name of ["people_notes", "position_notes"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (e) {}
  }
});