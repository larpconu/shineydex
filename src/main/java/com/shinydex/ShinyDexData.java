package com.shinydex;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Every shiny a player has owned, grouped by species and form.
 * Tag layout: { species: { "cobblemon:pikachu": { "normal": { genders:[..], aspects:[..], pokemon:[uuid..], count:N } } } }
 */
public class ShinyDexData {
    public static class FormRecord {
        public final Set<String> genders = new LinkedHashSet<>();
        public final Set<String> aspects = new LinkedHashSet<>();
        public final Set<String> pokemon = new LinkedHashSet<>();
        public int count;

        CompoundTag save(boolean includeIds) {
            CompoundTag tag = new CompoundTag();
            tag.put("genders", list(genders));
            tag.put("aspects", list(aspects));
            if (includeIds) tag.put("pokemon", list(pokemon));
            tag.putInt("count", Math.max(count, pokemon.size()));
            return tag;
        }

        static FormRecord load(CompoundTag tag) {
            FormRecord r = new FormRecord();
            read(tag.getList("genders", Tag.TAG_STRING), r.genders);
            read(tag.getList("aspects", Tag.TAG_STRING), r.aspects);
            read(tag.getList("pokemon", Tag.TAG_STRING), r.pokemon);
            r.count = Math.max(tag.getInt("count"), r.pokemon.size());
            return r;
        }
    }

    /** speciesId -> formName (lowercase) -> record */
    public final Map<String, Map<String, FormRecord>> species = new TreeMap<>();

    public FormRecord getOrCreate(String speciesId, String form) {
        return species.computeIfAbsent(speciesId, k -> new TreeMap<>()).computeIfAbsent(form, k -> new FormRecord());
    }

    public int totalShinies() {
        int total = 0;
        for (Map<String, FormRecord> forms : species.values()) for (FormRecord r : forms.values()) total += r.count;
        return total;
    }

    public CompoundTag save(boolean includeIds) {
        CompoundTag speciesTag = new CompoundTag();
        species.forEach((id, forms) -> {
            CompoundTag formsTag = new CompoundTag();
            forms.forEach((name, rec) -> formsTag.put(name, rec.save(includeIds)));
            speciesTag.put(id, formsTag);
        });
        CompoundTag root = new CompoundTag();
        root.put("species", speciesTag);
        return root;
    }

    public static ShinyDexData load(CompoundTag root) {
        ShinyDexData data = new ShinyDexData();
        CompoundTag speciesTag = root.getCompound("species");
        for (String id : speciesTag.getAllKeys()) {
            CompoundTag formsTag = speciesTag.getCompound(id);
            Map<String, FormRecord> forms = new TreeMap<>();
            for (String form : formsTag.getAllKeys()) forms.put(form, FormRecord.load(formsTag.getCompound(form)));
            data.species.put(id, forms);
        }
        return data;
    }

    private static ListTag list(Set<String> values) {
        ListTag list = new ListTag();
        for (String v : values) list.add(StringTag.valueOf(v));
        return list;
    }

    private static void read(ListTag list, Set<String> into) {
        for (int i = 0; i < list.size(); i++) into.add(list.getString(i));
    }
}
