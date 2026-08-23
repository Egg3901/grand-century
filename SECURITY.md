# Security policy

## Reporting

Do not open a public issue for a vulnerability, multiplayer authorization bypass, save or protocol exploit, private-data exposure, or deployment credential leak.

Report privately through one of these channels:

- [GitHub private security advisory](https://github.com/Egg3901/grand-century/security/advisories/new)
- Email `admin@ahousedividedgame.com`

Include the affected version, single-player or multiplayer mode, reproduction steps, and impact. Test against a local session whenever possible.

## Scope

Security-sensitive areas include WebSocket sessions, lobby identity, command authorization, snapshot decoding, save import, server administration, denial-of-service amplification, and any client claim the authoritative server accepts without validation.
