package com.shinydex.client;

import com.cobblemon.mod.common.CobblemonSounds;
import com.cobblemon.mod.common.api.pokedex.FormDexRecord;
import com.cobblemon.mod.common.api.pokedex.PokedexEntryProgress;
import com.cobblemon.mod.common.api.pokedex.SpeciesDexRecord;
import com.cobblemon.mod.common.api.pokemon.PokemonSpecies;
import com.cobblemon.mod.common.api.storage.player.client.ClientPokedexManager;
import com.cobblemon.mod.common.client.CobblemonClient;
import com.cobblemon.mod.common.client.gui.pokedex.PokedexGUI;
import com.cobblemon.mod.common.pokemon.FormData;
import com.cobblemon.mod.common.pokemon.Gender;
import com.cobblemon.mod.common.pokemon.Species;
import com.shinydex.ShinyDex;
import com.shinydex.ShinyDexData;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Opens Cobblemon's own Pokédex GUI (so every widget, tab, animation and control behaves exactly like the
 * real Pokédex) but feeds it a Pokédex built only from shiny Pokémon:
 *  - "Caught" = shiny Pokémon you have owned (tracked by the server side of this mod)
 *  - "Seen"   = Pokémon your regular Pokédex has seen in their shiny colours
 * Every entry is shown in its shiny colours. The player's real Pokédex is restored when the screen closes.
 */
public final class ShinyDexScreen {
    private static Screen activeScreen;
    private static boolean pendingOpen = false;
    private static ClientPokedexManager realPokedex;
    private static ClientPokedexManager shinyPokedex;
    private static final Set<SpeciesDexRecord> ownRecords = Collections.newSetFromMap(new IdentityHashMap<>());

    private ShinyDexScreen() {}

    public static void open() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;
        if (activeScreen != null) restore();
        if (!ClientShinyDex.hasReceived()) {
            mc.player.displayClientMessage(Component.translatable("shinydex.message.no_data"), true);
        }

        realPokedex = CobblemonClient.INSTANCE.getClientPokedexData();
        shinyPokedex = buildShinyPokedex(realPokedex, ClientShinyDex.get());
        CobblemonClient.INSTANCE.setClientPokedexData(shinyPokedex);
        ShinyCasingTexture.apply();

        pendingOpen = true;
        PokedexGUI.Companion.open(shinyPokedex, ShinyCasingTexture.TYPE, null, null);
        pendingOpen = false;

        if (mc.screen instanceof PokedexGUI gui && gui == activeScreen) {
            mc.getSoundManager().play(SimpleSoundInstance.forUI(CobblemonSounds.POKEDEX_OPEN, 1.0F));
        } else {
            // Cobblemon refused to open (e.g. no Pokédex regions loaded) - put everything back.
            restore();
        }
    }

    /** Fabric re-creates per-screen events on every init (including resizes), so hook them each time. */
    static void onScreenInit(Screen screen) {
        if (pendingOpen && screen instanceof PokedexGUI) {
            activeScreen = screen;
        }
        if (screen != activeScreen || activeScreen == null) return;
        ScreenEvents.remove(screen).register(s -> {
            if (s == activeScreen) restore();
        });
    }

    private static void restore() {
        activeScreen = null;
        ShinyCasingTexture.restore();
        if (shinyPokedex == null) return;
        if (CobblemonClient.INSTANCE.getClientPokedexData() == shinyPokedex) {
            // Keep any real Pokédex updates that arrived while the Shiny Dex was open.
            for (Map.Entry<ResourceLocation, SpeciesDexRecord> e : shinyPokedex.getSpeciesRecords().entrySet()) {
                if (!ownRecords.contains(e.getValue())) {
                    realPokedex.getSpeciesRecords().put(e.getKey(), e.getValue());
                }
            }
            realPokedex.clearCalculatedValues();
            CobblemonClient.INSTANCE.setClientPokedexData(realPokedex);
        }
        ownRecords.clear();
        shinyPokedex = null;
        realPokedex = null;
    }

    private static ClientPokedexManager buildShinyPokedex(ClientPokedexManager real, ShinyDexData shinies) {
        PokedexEntryProgress[] levels = PokedexEntryProgress.values(); // NONE/ENCOUNTERED/CAUGHT (or UNREGISTERED/SEEN/OWNED)
        PokedexEntryProgress seen = levels[1];
        PokedexEntryProgress caught = levels[levels.length - 1];

        ClientPokedexManager dex = new ClientPokedexManager(new HashMap<>());

        // Seen: forms the normal Pokédex has seen as shiny.
        for (Map.Entry<ResourceLocation, SpeciesDexRecord> e : real.getSpeciesRecords().entrySet()) {
            Species species = PokemonSpecies.INSTANCE.getByIdentifier(e.getKey());
            if (species == null) continue;
            SpeciesDexRecord realRecord = e.getValue();
            for (FormData form : allForms(species)) {
                FormDexRecord realForm = realRecord.getFormRecord(form.getName());
                if (realForm == null || !realForm.hasSeenShinyState(true) || realForm.getKnowledge().ordinal() < 1) continue;
                SpeciesDexRecord record = dex.getOrCreateSpeciesRecord(e.getKey());
                ownRecords.add(record);
                record.addAspects(realRecord.getAspects());
                FormDexRecord formRecord = record.getOrCreateFormRecord(form.getName());
                formRecord.getGenders().addAll(realForm.getGenders());
                formRecord.getSeenShinyStates().add("shiny");
                if (formRecord.getKnowledge().ordinal() < seen.ordinal()) formRecord.setKnowledgeProgress(seen);
            }
        }

        // Caught: shinies the player has owned.
        shinies.species.forEach((speciesId, forms) -> {
            ResourceLocation id = ResourceLocation.tryParse(speciesId);
            if (id == null) return;
            SpeciesDexRecord record = dex.getOrCreateSpeciesRecord(id);
            ownRecords.add(record);
            forms.forEach((formName, shiny) -> {
                record.addAspects(shiny.aspects);
                FormDexRecord formRecord = record.getOrCreateFormRecord(formName);
                for (String gender : shiny.genders) {
                    try {
                        formRecord.getGenders().add(Gender.valueOf(gender));
                    } catch (IllegalArgumentException ignored) {
                    }
                }
                formRecord.getSeenShinyStates().add("shiny");
                formRecord.setKnowledgeProgress(caught);
            });
        });

        dex.clearCalculatedValues();
        return dex;
    }

    private static List<FormData> allForms(Species species) {
        List<FormData> forms = new ArrayList<>(species.getForms());
        forms.add(species.getStandardForm());
        return forms;
    }
}
