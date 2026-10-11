package com.shinydex.network;

import com.shinydex.ShinyDex;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server -> client: the player's full Shiny Dex. */
public record ShinyDexSyncPayload(CompoundTag data) implements CustomPacketPayload {
    public static final Type<ShinyDexSyncPayload> TYPE = new Type<>(ShinyDex.id("sync"));
    public static final StreamCodec<RegistryFriendlyByteBuf, ShinyDexSyncPayload> CODEC =
        StreamCodec.composite(ByteBufCodecs.COMPOUND_TAG, ShinyDexSyncPayload::data, ShinyDexSyncPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
