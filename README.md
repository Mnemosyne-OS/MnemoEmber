<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# Ember

A Mnemosyne OS cartridge to cut down on smoking. Log each cigarette, vape or
joint in one tap. See your day on a 24-hour clock. When a craving comes, ride
it out: take a virtual cigarette (hold to draw in, release to breathe out), do
a breathing exercise or a few push-ups. The craving is then logged as passed.

The log is saved on your machine. The chat of Mnemosyne OS can read it once
you allow it.

## Requirements

Mnemosyne OS 1.8.0 or later. The optional camera check ("Smoking?") uses the
host's hand tracking.

## Install

In Mnemosyne OS, open the MnemoHub, choose « Add a cartridge », and paste this
repository's URL: `https://github.com/Mnemosyne-OS/MnemoEmber`.

## Permissions

- `vault:write`: saves the log to a vault, so the chat can read it.
- `camera:observe`: the optional camera check. It stays off until you turn it
  on.

## Develop

Ember is developed inside the Mnemosyne OS workspace, where its dev server
runs on port 5233. This repository carries the built app in `dist/`, which is
what Mnemosyne OS installs.

## Licence

MIT. See [LICENSE](LICENSE).

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
