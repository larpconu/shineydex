# Shiny Dex

A Cobblemon add-on for **Minecraft 1.21.1 (Fabric)**. It's Cobblemon's Pokédex, but black and glossy, and it only tracks your **shiny** Pokémon.

* **Same Pokédex, 1:1.** Opening the Shiny Dex opens Cobblemon's real Pokédex screen: same layout, colors, tabs (info, abilities, size, stats, drops), forms, search, region switching, model dragging and sounds. Only the outer casing is different: a glossy black that matches the item.
* **Only shinies.** *Caught* counts the shiny Pokémon you've owned. *Seen* counts Pokémon your normal Pokédex has seen as shiny. Every entry is shown in its shiny colors.
* **Tracks every shiny you get:** captures, starters, trades, evolutions, eggs and fossils. You get a chat message when a new one is registered.
* **Counts shinies you already have.** When you join, any shinies in your party or PC are added automatically.
* **Item:** the **Shiny Dex** uses Cobblemon's black Pokédex model and textures, made a little blacker and shinier. It's a flat sprite in your inventory and the open 3D Pokédex in your hand. Right-click to open it.
* Also opens with `/shinydex` or a keybind (unbound by default; set it in Controls → Shiny Dex).

## Recipe

The black Pokédex recipe with pricier ingredients: gold ingots instead of iron, diamonds instead of copper.

```
G A D      G = Gold Ingot
G S G      A = Black Apricorn
G A D      D = Diamond
           S = Pokédex screen ingredient (Bright Powder, Glow Ink Sac, Redstone, Glowstone Dust or Blaze Powder)
```

## Install

Put `shinydex-<version>.jar` in your `mods` folder with **Cobblemon (1.6+ for 1.21.1)**, **Fabric API** and **Fabric Language Kotlin**.
Install it on the **server too** when playing multiplayer, because the server keeps track of each player's shinies (saved in `<world>/shinydex/`).

## Building

```
./gradlew build
```
The jar ends up in `build/libs/`. Cobblemon is downloaded from Modrinth on the first build.
