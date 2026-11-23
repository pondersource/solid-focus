<template>
    <Account v-if="$solid.hasLoggedIn()" />
    <DropdownMenuRoot v-else>
        <DropdownMenuTrigger as-child>
            <Button
                size="icon"
                variant="ghost"
                :aria-label="$td('user.menu', 'Configuration')"
                :title="$td('user.menu', 'Configuration')"
            >
                <i-zondicons-cog class="size-5" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
            <DropdownMenuContent class="rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-black/5" align="start">
                <DropdownMenuItem
                    class="cursor-pointer rounded p-2 outline-none hover:bg-gray-50"
                    @select="openStorage()"
                >
                    {{ $td('user.logIn', 'Connect account') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                    class="cursor-pointer rounded p-2 outline-none hover:bg-gray-50"
                    @select="$ui.modal(SettingsModal)"
                >
                    {{ $td('user.settings', 'Settings') }}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { Button, SettingsModal } from '@aerogel/core';
import { Account } from '@aerogel/plugin-local-first';
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui';

import { openStorage } from '@/storage';
</script>
