package com.shinydex;

import com.cobblemon.mod.common.api.Priority;
import com.cobblemon.mod.common.api.events.CobblemonEvents;
import com.cobblemon.mod.common.api.events.pokemon.PokemonCapturedEvent;
import com.cobblemon.mod.common.api.events.pokemon.PokemonGainedEvent;
import com.shinydex.network.ShinyDexSyncPayload;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ShinyDex implements ModInitializer {
    public static final String MOD_ID = "shinydex";
    public static final Logger LOGGER = LoggerFactory.getLogger("Shiny Dex");

    public static final ShinyDexItem SHINY_DEX = new ShinyDexItem(new Item.Properties().stacksTo(1).rarity(Rarity.EPIC));

    /** Set by the client entrypoint; opens the Shiny Dex screen. Never called on a dedicated server. */
    public static Runnable clientOpenHook = () -> {};

    private static MinecraftServer server;

    public static ResourceLocation id(String path) {
        return ResourceLocation.fromNamespaceAndPath(MOD_ID, path);
    }

    @Override
    public void onInitialize() {
        Registry.register(BuiltInRegistries.ITEM, id("shiny_dex"), SHINY_DEX);
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(entries -> entries.accept(SHINY_DEX));

        PayloadTypeRegistry.playS2C().register(ShinyDexSyncPayload.TYPE, ShinyDexSyncPayload.CODEC);

        ServerLifecycleEvents.SERVER_STARTED.register(s -> server = s);
        ServerLifecycleEvents.SERVER_STOPPING.register(s -> {
            ShinyDexManager.saveAll();
            ShinyDexManager.clear();
            server = null;
        });

        ServerPlayConnectionEvents.JOIN.register((handler, sender, srv) -> {
            ServerPlayer player = handler.getPlayer();
            // Run a tick later so Cobblemon has finished loading the player's party and PC.
            srv.execute(() -> ShinyDexManager.scanStorage(player));
        });
        ServerPlayConnectionEvents.DISCONNECT.register((handler, srv) -> ShinyDexManager.unload(handler.getPlayer().getUUID()));

        // Fires for every way a player obtains a Pokémon: captures, starters, trades, evolutions, eggs, fossils...
        CobblemonEvents.POKEMON_GAINED.subscribe(Priority.LOWEST, (Function1<PokemonGainedEvent, Unit>) event -> {
            if (server != null && event.getPokemon().getShiny()) {
                ServerPlayer player = server.getPlayerList().getPlayer(event.getPlayerId());
                if (player != null) ShinyDexManager.register(player, event.getPokemon(), true);
            }
            return Unit.INSTANCE;
        });
        CobblemonEvents.POKEMON_CAPTURED.subscribe(Priority.LOWEST, (Function1<PokemonCapturedEvent, Unit>) event -> {
            if (event.getPokemon().getShiny()) ShinyDexManager.register(event.getPlayer(), event.getPokemon(), true);
            return Unit.INSTANCE;
        });

        LOGGER.info("Shiny Dex loaded");
    }

    public static MinecraftServer getServer() {
        return server;
    }
}
