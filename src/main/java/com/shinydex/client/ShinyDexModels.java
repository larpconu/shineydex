package com.shinydex.client;

import com.shinydex.ShinyDex;
import net.minecraft.client.resources.model.ModelResourceLocation;
import net.minecraft.resources.ResourceLocation;

public final class ShinyDexModels {
    public static final ResourceLocation MODEL_OPEN = ShinyDex.id("item/shiny_dex_model");
    public static final ResourceLocation MODEL_OFF = ShinyDex.id("item/shiny_dex_model_off");

    /** Extra models added through Fabric's ModelLoadingPlugin are stored under this variant. */
    public static ModelResourceLocation extra(ResourceLocation id) {
        return new ModelResourceLocation(id, "fabric_resource");
    }

    /** The flat inventory sprite (the item's normal model). */
    public static final ModelResourceLocation FLAT = new ModelResourceLocation(ShinyDex.id("shiny_dex"), "inventory");

    private ShinyDexModels() {}
}
