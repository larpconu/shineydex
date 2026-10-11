package com.shinydex.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import com.shinydex.ShinyDexItem;
import com.shinydex.client.ShinyDexModels;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.ItemModelShaper;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Same rendering rules as Cobblemon's Pokédex: flat sprite in inventories and item frames, the 3D open
 * Pokédex when held, and the 3D closed (screen off) Pokédex otherwise.
 */
@Mixin(ItemRenderer.class)
public abstract class ItemRendererMixin {
    @Shadow @Final private ItemModelShaper itemModelShaper;

    @Shadow
    public abstract void render(ItemStack stack, ItemDisplayContext context, boolean leftHanded, PoseStack poseStack,
                                MultiBufferSource buffers, int light, int overlay, BakedModel model);

    @Unique private boolean shinydex$rendering2d = false;

    @Inject(
        method = "render(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;ZLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IILnet/minecraft/client/resources/model/BakedModel;)V",
        at = @At("HEAD"),
        cancellable = true
    )
    private void shinydex$flatInGui(ItemStack stack, ItemDisplayContext context, boolean leftHanded, PoseStack poseStack,
                                    MultiBufferSource buffers, int light, int overlay, BakedModel model, CallbackInfo ci) {
        if (shinydex$rendering2d || !(stack.getItem() instanceof ShinyDexItem)) return;
        if (context != ItemDisplayContext.GUI && context != ItemDisplayContext.FIXED) return;
        BakedModel flat = itemModelShaper.getModelManager().getModel(ShinyDexModels.FLAT);
        if (flat == model) return;
        ci.cancel();
        shinydex$rendering2d = true;
        try {
            render(stack, context, leftHanded, poseStack, buffers, light, overlay, flat);
        } finally {
            shinydex$rendering2d = false;
        }
    }

    @Inject(method = "getModel", at = @At("HEAD"), cancellable = true)
    private void shinydex$model3d(ItemStack stack, Level level, LivingEntity entity, int seed, CallbackInfoReturnable<BakedModel> cir) {
        if (!(stack.getItem() instanceof ShinyDexItem)) return;
        boolean held = entity != null && (entity.getMainHandItem() == stack
            || (entity.getOffhandItem() == stack && !(entity.getMainHandItem().getItem() instanceof ShinyDexItem)));
        BakedModel model = itemModelShaper.getModelManager().getModel(
            ShinyDexModels.extra(held ? ShinyDexModels.MODEL_OPEN : ShinyDexModels.MODEL_OFF));
        BakedModel resolved = model.getOverrides().resolve(model, stack, level instanceof ClientLevel cl ? cl : null, entity, seed);
        cir.setReturnValue(resolved == null ? itemModelShaper.getModelManager().getMissingModel() : resolved);
    }
}
