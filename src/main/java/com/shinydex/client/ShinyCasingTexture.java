package com.shinydex.client;

import com.cobblemon.mod.common.client.pokedex.PokedexType;
import com.mojang.blaze3d.platform.NativeImage;
import com.shinydex.ShinyDex;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.Resource;

import java.io.InputStream;
import java.util.Optional;

/**
 * While the Shiny Dex is open, Cobblemon's black Pokédex casing texture is swapped for a glossy black
 * version built at runtime with the same recolour as the Shiny Dex item texture. Everything inside the
 * casing is Cobblemon's untouched Pokédex UI. The original texture is restored when the screen closes.
 */
public final class ShinyCasingTexture {
    public static final PokedexType TYPE = PokedexType.BLACK;
    private static boolean applied = false;

    private ShinyCasingTexture() {}

    public static void apply() {
        ResourceLocation id = TYPE.getTexturePath();
        Minecraft mc = Minecraft.getInstance();
        try {
            Optional<Resource> resource = mc.getResourceManager().getResource(id);
            if (resource.isEmpty()) return;
            NativeImage image;
            try (InputStream in = resource.get().open()) {
                image = NativeImage.read(in);
            }
            recolor(image);
            mc.getTextureManager().register(id, new DynamicTexture(image));
            applied = true;
        } catch (Exception e) {
            ShinyDex.LOGGER.warn("Could not build the Shiny Dex casing texture", e);
        }
    }

    public static void restore() {
        if (!applied) return;
        applied = false;
        // Dropping our texture makes Minecraft reload Cobblemon's original on next use.
        Minecraft.getInstance().getTextureManager().release(TYPE.getTexturePath());
    }

    /** Same treatment as tools/make_item_textures.py: a little blacker plus glossy highlight streaks. */
    static void recolor(NativeImage image) {
        int w = image.getWidth();
        int h = image.getHeight();
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int abgr = image.getPixelRGBA(x, y);
                int a = (abgr >>> 24) & 0xFF;
                if (a == 0) continue;
                int b = (abgr >>> 16) & 0xFF;
                int g = (abgr >>> 8) & 0xFF;
                int r = abgr & 0xFF;
                double l = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
                int sat = Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b));
                if (sat > 70 && l > 0.25) continue; // keep the coloured indicator lights

                double nr = r * 0.58, ng = g * 0.58, nb = b * 0.66;
                double d = (x * ((double) h / w) + y) / (2.0 * h);
                double band = Math.max(0, 1 - Math.abs(d - 0.30) / 0.035)
                    + 0.6 * Math.max(0, 1 - Math.abs(d - 0.38) / 0.015)
                    + 0.5 * Math.max(0, 1 - Math.abs(d - 0.78) / 0.02);
                double t = Math.min(1.0, band) * (0.25 + l * 0.6);
                nr += (225 - nr) * t;
                ng += (228 - ng) * t;
                nb += (240 - nb) * t;
                int out = (a << 24) | (clamp(nb) << 16) | (clamp(ng) << 8) | clamp(nr);
                image.setPixelRGBA(x, y, out);
            }
        }
    }

    private static int clamp(double v) {
        return Math.max(0, Math.min(255, (int) Math.round(v)));
    }
}
