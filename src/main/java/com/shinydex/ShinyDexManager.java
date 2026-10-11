package com.shinydex;

import com.cobblemon.mod.common.Cobblemon;
import com.cobblemon.mod.common.pokemon.Pokemon;
import com.shinydex.network.ShinyDexSyncPayload;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.storage.LevelResource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Server-side storage of every player's Shiny Dex, saved to <world>/shinydex/<uuid>.dat */
public final class ShinyDexManager {
    private static final Map<UUID, ShinyDexData> CACHE = new HashMap<>();

    private ShinyDexManager() {}

    public static ShinyDexData get(ServerPlayer player) {
        return CACHE.computeIfAbsent(player.getUUID(), uuid -> load(player.server, uuid));
    }

    /**
     * Records a shiny for the player. Returns true if it was not already in the dex.
     */
    public static boolean register(ServerPlayer player, Pokemon pokemon, boolean announce) {
        if (!pokemon.getShiny()) return false;
        ShinyDexData data = get(player);
        String speciesId = pokemon.getSpecies().getResourceIdentifier().toString();
        String form = pokemon.getForm().getName().toLowerCase(Locale.ROOT);
        boolean newForm = !data.species.containsKey(speciesId) || !data.species.get(speciesId).containsKey(form);
        ShinyDexData.FormRecord record = data.getOrCreate(speciesId, form);

        boolean changed = record.pokemon.add(pokemon.getUuid().toString());
        changed |= record.genders.add(pokemon.getGender().name());
        changed |= record.aspects.addAll(pokemon.getAspects());
        if (!changed && !newForm) return false;
        record.count = Math.max(record.count, record.pokemon.size());

        save(player.server, player.getUUID(), data);
        sync(player);

        if (announce) {
            Component name = pokemon.getSpecies().getTranslatedName().copy().withStyle(ChatFormatting.WHITE, ChatFormatting.BOLD);
            Component message = newForm
                ? Component.translatable("shinydex.message.registered", name)
                : Component.translatable("shinydex.message.registered_again", name, record.count);
            player.sendSystemMessage(message.copy().withStyle(ChatFormatting.GOLD));
            if (newForm) {
                player.playNotifySound(SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 1.0F, 1.4F);
            }
        }
        return newForm;
    }

    /** Adds any shinies already in the player's party or PC (so shinies caught before installing the mod count). */
    public static void scanStorage(ServerPlayer player) {
        try {
            for (Pokemon p : Cobblemon.INSTANCE.getStorage().getParty(player)) {
                if (p != null && p.getShiny()) register(player, p, false);
            }
            for (Pokemon p : Cobblemon.INSTANCE.getStorage().getPC(player)) {
                if (p != null && p.getShiny()) register(player, p, false);
            }
        } catch (Throwable t) {
            ShinyDex.LOGGER.warn("Could not scan storage of {} for shinies", player.getGameProfile().getName(), t);
        }
        sync(player);
    }

    public static void sync(ServerPlayer player) {
        if (ServerPlayNetworking.canSend(player, ShinyDexSyncPayload.TYPE)) {
            ServerPlayNetworking.send(player, new ShinyDexSyncPayload(get(player).save(false)));
        }
    }

    public static void unload(UUID uuid) {
        CACHE.remove(uuid);
    }

    public static void clear() {
        CACHE.clear();
    }

    public static void saveAll() {
        MinecraftServer server = ShinyDex.getServer();
        if (server == null) return;
        CACHE.forEach((uuid, data) -> save(server, uuid, data));
    }

    private static Path file(MinecraftServer server, UUID uuid) {
        return server.getWorldPath(LevelResource.ROOT).resolve("shinydex").resolve(uuid + ".dat");
    }

    private static ShinyDexData load(MinecraftServer server, UUID uuid) {
        Path path = file(server, uuid);
        if (Files.exists(path)) {
            try {
                return ShinyDexData.load(NbtIo.readCompressed(path, NbtAccounter.unlimitedHeap()));
            } catch (Exception e) {
                ShinyDex.LOGGER.error("Failed to read Shiny Dex for {}", uuid, e);
            }
        }
        return new ShinyDexData();
    }

    private static void save(MinecraftServer server, UUID uuid, ShinyDexData data) {
        Path path = file(server, uuid);
        try {
            Files.createDirectories(path.getParent());
            CompoundTag tag = data.save(true);
            NbtIo.writeCompressed(tag, path);
        } catch (Exception e) {
            ShinyDex.LOGGER.error("Failed to save Shiny Dex for {}", uuid, e);
        }
    }
}
