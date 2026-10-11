package com.shinydex.client;

import com.mojang.blaze3d.platform.InputConstants;
import com.shinydex.ShinyDex;
import com.shinydex.network.ShinyDexSyncPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

public class ShinyDexClient implements ClientModInitializer {
    public static KeyMapping openKey;
    private static boolean openNextTick = false;

    @Override
    public void onInitializeClient() {
        ShinyDex.clientOpenHook = ShinyDexScreen::open;

        ClientPlayNetworking.registerGlobalReceiver(ShinyDexSyncPayload.TYPE,
            (payload, context) -> context.client().execute(() -> ClientShinyDex.update(payload.data())));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> ClientShinyDex.reset());

        // The 3D held models, exactly like Cobblemon's Pokédex.
        ModelLoadingPlugin.register(ctx -> ctx.addModels(ShinyDexModels.MODEL_OPEN, ShinyDexModels.MODEL_OFF));

        openKey = KeyBindingHelper.registerKeyBinding(new KeyMapping(
            "key.shinydex.open", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_UNKNOWN, "key.categories.shinydex"));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (openNextTick && client.screen == null) {
                openNextTick = false;
                ShinyDexScreen.open();
            }
            while (openKey.consumeClick()) {
                if (client.screen == null && client.player != null) ShinyDexScreen.open();
            }
        });

        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) ->
            dispatcher.register(ClientCommandManager.literal("shinydex").executes(ctx -> {
                // The chat screen closes after running the command, so open on the next tick.
                openNextTick = true;
                return 1;
            })));

        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> ShinyDexScreen.onScreenInit(screen));
    }
}
