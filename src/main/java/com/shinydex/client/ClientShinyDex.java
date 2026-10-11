package com.shinydex.client;

import com.shinydex.ShinyDexData;
import net.minecraft.nbt.CompoundTag;

/** The local player's Shiny Dex as last sent by the server. */
public final class ClientShinyDex {
    private static ShinyDexData data = new ShinyDexData();
    private static boolean received = false;

    private ClientShinyDex() {}

    public static void update(CompoundTag tag) {
        data = ShinyDexData.load(tag);
        received = true;
    }

    public static void reset() {
        data = new ShinyDexData();
        received = false;
    }

    public static ShinyDexData get() {
        return data;
    }

    public static boolean hasReceived() {
        return received;
    }
}
