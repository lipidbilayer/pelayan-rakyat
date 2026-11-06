// Fresh Phase 3 markers for the T3.8 data-leak test. They are deliberately
// unique and never appear in page copy, so any occurrence in dist/ is a leak.
export const T38_MARKERS = {
  unverifiedBlunderReason: "T38LEAKUNVERIFIEDBLUNDER7f41c",
  rejectedReplyText: "T38LEAKREJECTEDREPLYTEXT7f41c",
  replyIdentityCheck: "T38LEAKIDENTITYCHECK7f41c",
  unverifiedPromiseNote: "T38LEAKUNVERIFIEDPROMISENOTE7f41c",
  recordInternalNotes: "T38LEAKRECORDINTERNALNOTES7f41c",
};

export const T38_MARKER_LIST = Object.values(T38_MARKERS);
