# Security policy

## Supported versions

Only the latest release of the Withings integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-withings](https://github.com/prohand/gladys-withings/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, Client secret, Withings user ids and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes — in
particular the handling of the OAuth2 tokens, of the Client secret and of the
notifications relayed by Gladys Plus.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), Gladys Plus, and
the Withings services and API (report to Withings).

## Good practices for users

- Keep the Client secret only in the integration's secret field; never paste it in an issue.
- The integration handles **health data**: keep the Gladys instance private, behind a strong
  password, and give the Withings developer app only to this integration.
- To cut the access at once, use **Disconnect the Withings account** in the Configuration screen,
  and revoke the app in your Withings account settings.
- Keep Gladys and the integration up to date.
