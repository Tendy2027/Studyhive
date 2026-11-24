# Security checklist

## Supabase dashboard (the SQL cannot do these)
- Authentication > Providers: turn **off Email** (and every provider except Google). Your anon key is public, so an enabled email provider lets anyone create accounts by calling the sign-up API directly and skip your Google sign-in.
- Authentication > Rate Limits: keep the defaults or tighten them.
- Settings: enable the spend cap or usage alerts so a flood of traffic cannot run up a bill.
- Never put the `service_role` key in this project or in Vercel variables that start with `VITE_`.
- Consider the optional university-email block at the bottom of `004-delete-account-and-abuse-limits.sql`.

## Vercel
- Turn on the Vercel Firewall / bot protection if you see abuse. `vercel.json` already sets the security headers and CSP.

## Tests to run with two accounts (A and B) before launch
1. B tries to post in a group B has not joined. Expected: refused.
2. B tries to delete or edit A's post, A's group, or A's materials. Expected: refused.
3. B tries to make themselves admin of A's group. Expected: refused.
4. A posts 9 times in one minute. Expected: the 9th is refused with "too fast".
5. A joins a 31st group. Expected: refused.
6. B reports a post, A (group admin) sees it in Moderation, B cannot see other reports.
7. A uploads a file, B who is not in the group tries to upload into A's group folder. Expected: refused.
8. B deletes their account. Expected: replies, files and memberships gone; posts with other people's replies show "Deleted user".
9. A is the only admin, leaves; B (member) becomes admin automatically.
10. Sign-up through the email API is refused once the Email provider is off.

## Known limits
No per-user total storage quota yet (only per-file size, file-type and upload-rate limits). No automatic content scanning.
