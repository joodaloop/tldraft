## todo
- Draft deletion, free up the ids
- Presence indicators
- Time-spent in doc tracking
- Shareable URLs:
  - Revocable edit
  - Permanent edit
  - Revocable read

## model
- if draft created offline, mark as such, syncs when doc opened while online
- if draft DO accessed by logged in user, add a user_pages for them
- on new DO creation, store id of user that creates it in created_by field (if they're logged in)
- if someone accesses a DO for a page that doesn't have a created_by yet, make them the creator
