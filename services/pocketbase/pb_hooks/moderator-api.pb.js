/// <reference path="../pb_data/types.d.ts" />

if ($os.getenv("PB_HOOKS_MODE") === "serve") {
  routerAdd("GET", "/api/moderator/{collection}/{id}", (e) => {
    const auth = e.auth;
    const role = auth ? (typeof auth.get === "function" ? auth.get("role") : auth.role) : "";
    if (!role || (role !== "moderator" && role !== "admin")) {
      throw new ForbiddenError("moderator access required");
    }
    const collection = e.request.pathValue("collection");
    const id = e.request.pathValue("id");
    const record = e.app.findRecordById(collection, id);
    try { record.unhide("notes"); } catch (err) {}
    try { record.unhide("rejection_reason"); } catch (err) {}
    try { record.unhide("identity_check"); } catch (err) {}
    try { record.unhide("decline_reason"); } catch (err) {}
    return e.json(200, record);
  });
}