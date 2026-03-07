/**
 * ChannelSettingsPage
 *
 * Displays configured channel adapters for the active workspace with
 * enable/disable toggles, daemon status, and start/stop controls.
 *
 * Includes an inline creation form for adding new Slack or WhatsApp channels.
 */

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useAtomValue } from "jotai";
import { Hash, MessageCircle, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader } from "@/components/app-shell/PanelHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import { Spinner } from "@craft-agent/ui";
import { useAppShellContext } from "@/context/AppShellContext";
import { cn } from "@/lib/utils";
import { slugify, isValidSlug } from "@/lib/slugify";
import { routes } from "@/lib/navigate";
import { daemonStateAtom } from "@/atoms/daemon";
import { DaemonStatusIndicator } from "@/components/ui/daemon-status-indicator";
import type { ChannelConfig } from "@craft-agent/shared/channels";
import type { DetailsPageMeta } from "@/lib/navigation-registry";

import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsInput,
  SettingsSecretInput,
  SettingsRadioGroup,
  SettingsRadioCard,
} from "@/components/settings";

export const meta: DetailsPageMeta = {
  navigator: "settings",
  slug: "channels",
};

/** Icon for a channel adapter type */
function AdapterIcon({ adapter }: { adapter: string }) {
  if (adapter === "slack")
    return <Hash className="h-4 w-4 text-muted-foreground" />;
  if (adapter === "whatsapp")
    return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

/* ------------------------------------------------------------------ */
/*  Channel creation form state                                       */
/* ------------------------------------------------------------------ */

interface ChannelFormState {
  adapter: "slack" | "whatsapp" | "";
  name: string;
  credential: string;
  appToken: string;
  channelIds: string;
  triggerPatterns: string;
  pollIntervalMs: number;
}

const initialFormState: ChannelFormState = {
  adapter: "",
  name: "",
  credential: "",
  appToken: "",
  channelIds: "",
  triggerPatterns: "",
  pollIntervalMs: 10000,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ChannelSettingsPage() {
  const { activeWorkspaceId } = useAppShellContext();
  const daemonState = useAtomValue(daemonStateAtom);

  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ChannelFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDaemonTransitioning =
    daemonState === "starting" || daemonState === "stopping";

  useEffect(() => {
    if (!activeWorkspaceId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    window.electronAPI
      .getChannels(activeWorkspaceId)
      .then((configs) => {
        setChannels(configs || []);
      })
      .catch((err) => {
        console.error("[ChannelSettings] Failed to load channels:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [activeWorkspaceId]);

  const handleToggleChannel = useCallback(
    async (channel: ChannelConfig, enabled: boolean) => {
      if (!activeWorkspaceId) return;
      const updated = { ...channel, enabled };
      try {
        await window.electronAPI.updateChannel(activeWorkspaceId, updated);
        setChannels((prev) =>
          prev.map((c) => (c.slug === channel.slug ? updated : c)),
        );

        // Auto-start daemon when first channel enabled
        if (enabled && daemonState === "stopped") {
          window.electronAPI.startDaemon().catch((err) => {
            console.error("[ChannelSettings] Auto-start daemon failed:", err);
            toast.error("Failed to start daemon");
          });
        }

        // Auto-stop daemon when last channel disabled (check updated list)
        if (!enabled && daemonState === "running") {
          const otherEnabled = channels.some(
            (c) => c.slug !== channel.slug && c.enabled,
          );
          if (!otherEnabled) {
            window.electronAPI.stopDaemon().catch((err) => {
              console.error("[ChannelSettings] Auto-stop daemon failed:", err);
              toast.error("Failed to stop daemon");
            });
          }
        }
      } catch (err) {
        console.error("[ChannelSettings] Failed to update channel:", err);
        toast.error("Failed to update channel");
      }
    },
    [activeWorkspaceId, daemonState, channels],
  );

  const handleDeleteChannel = useCallback(
    async (slug: string) => {
      if (!activeWorkspaceId) return;
      try {
        await window.electronAPI.deleteChannel(activeWorkspaceId, slug);
        setChannels((prev) => prev.filter((c) => c.slug !== slug));
        toast.success("Channel deleted");
      } catch (err) {
        console.error("[ChannelSettings] Failed to delete channel:", err);
        toast.error("Failed to delete channel");
      }
    },
    [activeWorkspaceId],
  );

  const handleDaemonToggle = useCallback(async () => {
    try {
      if (daemonState === "running") {
        await window.electronAPI.stopDaemon();
      } else {
        await window.electronAPI.startDaemon();
      }
    } catch (err) {
      console.error("[ChannelSettings] Daemon toggle failed:", err);
      toast.error("Failed to toggle daemon");
    }
  }, [daemonState]);

  /* ---------------------------------------------------------------- */
  /*  Creation form handlers                                          */
  /* ---------------------------------------------------------------- */

  function handleOpenForm() {
    setForm(initialFormState);
    setFormError(null);
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setForm(initialFormState);
    setFormError(null);
  }

  function getFormValidationError(): string | null {
    const slug = generatedSlug;
    if (!form.adapter) return "Select an adapter type";
    if (!form.name.trim()) return "Name is required";
    if (!form.credential.trim()) return "Credential is required";
    if (slug && !isValidSlug(slug))
      return "Generated slug is invalid. Use only letters, numbers, and hyphens.";
    if (slug && channels.some((c) => c.slug === slug))
      return `A channel with slug "${slug}" already exists`;
    if (form.adapter === "slack" && !form.channelIds.trim())
      return "At least one Slack channel ID is required";
    return null;
  }

  async function handleSaveChannel() {
    if (!activeWorkspaceId) return;
    setFormError(null);

    const error = getFormValidationError();
    if (error) {
      setFormError(error);
      return;
    }

    const slug = generatedSlug;
    setIsSaving(true);
    try {
      const pollInterval =
        form.adapter === "slack"
          ? form.pollIntervalMs || 10000
          : undefined;

      const channelIdList =
        form.adapter === "slack" && form.channelIds.trim()
          ? form.channelIds.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;

      const triggerPatternList = form.triggerPatterns.trim()
        ? form.triggerPatterns.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      const appTokenSlug =
        form.adapter === "slack" && form.appToken.trim()
          ? `${slug}-app-token`
          : undefined;

      const config: ChannelConfig = {
        slug,
        enabled: true,
        adapter: form.adapter,
        pollIntervalMs: pollInterval,
        credentials: {
          channelSlug: slug,
          ...(appTokenSlug ? { appTokenSlug } : {}),
        },
        filter: {
          channelIds: channelIdList,
          triggerPatterns: triggerPatternList,
        },
      };

      // Config first, then credentials (each IPC mutation triggers debounced daemon delivery)
      await window.electronAPI.updateChannel(activeWorkspaceId, config);
      await window.electronAPI.setChannelCredential(
        activeWorkspaceId,
        slug,
        form.credential,
      );

      // Store app-level token as a separate channel credential
      if (appTokenSlug && form.appToken.trim()) {
        await window.electronAPI.setChannelCredential(
          activeWorkspaceId,
          appTokenSlug,
          form.appToken.trim(),
        );
      }

      setChannels((prev) => [...prev, config]);
      setShowForm(false);
      setForm(initialFormState);
      toast.success("Channel created");
    } catch (err) {
      console.error("[ChannelSettings] Failed to create channel:", err);
      toast.error("Failed to create channel");
    } finally {
      setIsSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Derived values                                                  */
  /* ---------------------------------------------------------------- */

  const generatedSlug =
    form.adapter && form.name.trim()
      ? slugify(`${form.adapter}-${form.name}`)
      : "";

  const isFormIncomplete = getFormValidationError() !== null;

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  const header = (
    <PanelHeader
      title="Channels"
      actions={
        <div className="flex items-center gap-1">
          {!showForm && (
            <button
              type="button"
              onClick={handleOpenForm}
              className="inline-flex items-center h-8 px-2.5 text-sm rounded-lg hover:bg-foreground/[0.02] transition-colors"
              title="Add channel"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <HeaderMenu
            route={routes.view.settings("channels")}
            helpFeature="channels"
          />
        </div>
      }
    />
  );

  if (!activeWorkspaceId) {
    return (
      <div className="h-full flex flex-col">
        {header}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No workspace selected
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {header}
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {header}
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-8">
              {/* Daemon Status */}
              <SettingsSection title="Daemon">
                <SettingsCard>
                  <SettingsRow
                    label="Status"
                    action={
                      <button
                        type="button"
                        onClick={handleDaemonToggle}
                        disabled={isDaemonTransitioning}
                        className={cn(
                          "inline-flex items-center h-8 px-3 text-sm rounded-lg bg-background shadow-minimal transition-colors",
                          isDaemonTransitioning
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-foreground/[0.02]",
                        )}
                      >
                        {daemonState === "running" ? "Stop" : "Start"}
                      </button>
                    }
                  >
                    <DaemonStatusIndicator state={daemonState} size="sm" />
                  </SettingsRow>
                </SettingsCard>
              </SettingsSection>

              {/* New Channel Form */}
              {showForm && (
                <SettingsSection title="New Channel">
                  <SettingsCard>
                    <div className="px-4 py-4 space-y-5">
                      {/* Adapter type selection */}
                      <SettingsRadioGroup
                        value={form.adapter}
                        onValueChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            adapter: value as "slack" | "whatsapp",
                          }))
                        }
                      >
                        <SettingsRadioCard
                          value="slack"
                          label="Slack"
                          description="Poll Slack channels for messages"
                          icon={
                            <Hash className="h-4 w-4 text-muted-foreground" />
                          }
                          inCard
                        />
                        <SettingsRadioCard
                          value="whatsapp"
                          label="WhatsApp"
                          description="Subscribe to WhatsApp via Baileys"
                          icon={
                            <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          }
                          inCard
                        />
                      </SettingsRadioGroup>

                      {/* Name input (shown after adapter selected) */}
                      {form.adapter && (
                        <>
                          <SettingsInput
                            label="Name"
                            value={form.name}
                            onChange={(value) =>
                              setForm((prev) => ({ ...prev, name: value }))
                            }
                            placeholder="my-team-alerts"
                          />
                          {generatedSlug && (
                            <p className="text-xs text-muted-foreground -mt-3">
                              Slug: {generatedSlug}
                            </p>
                          )}
                        </>
                      )}

                      {/* Adapter-conditional fields */}
                      {form.adapter === "slack" && (
                        <>
                          <SettingsSecretInput
                            label="Bot Token"
                            value={form.credential}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                credential: value,
                              }))
                            }
                            placeholder="xoxb-..."
                          />
                          <SettingsSecretInput
                            label="App-Level Token (optional)"
                            value={form.appToken}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                appToken: value,
                              }))
                            }
                            placeholder="xapp-..."
                          />
                          <SettingsInput
                            label="Channel IDs"
                            description="Comma-separated Slack channel IDs to monitor"
                            value={form.channelIds}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                channelIds: value,
                              }))
                            }
                            placeholder="C01234567, C07654321"
                          />
                          <SettingsInput
                            label="Poll Interval (ms)"
                            value={String(form.pollIntervalMs)}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                pollIntervalMs: parseInt(value) || 10000,
                              }))
                            }
                            placeholder="10000"
                          />
                        </>
                      )}

                      {form.adapter === "whatsapp" && (
                        <SettingsInput
                          label="Auth State Path"
                          description="Directory for WhatsApp auth state persistence"
                          value={form.credential}
                          onChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              credential: value,
                            }))
                          }
                          placeholder="~/.kata-agents/whatsapp-auth"
                        />
                      )}

                      {/* Trigger patterns (both adapters) */}
                      {form.adapter && (
                        <SettingsInput
                          label="Trigger Patterns"
                          description="Optional comma-separated regex patterns to filter messages"
                          value={form.triggerPatterns}
                          onChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              triggerPatterns: value,
                            }))
                          }
                          placeholder="help.*,urgent.*"
                        />
                      )}

                      {/* Validation error */}
                      {formError && (
                        <p className="text-sm text-destructive">{formError}</p>
                      )}

                      {/* Action buttons */}
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleCancelForm}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveChannel}
                          disabled={isSaving || isFormIncomplete}
                        >
                          {isSaving ? "Saving..." : "Save Channel"}
                        </Button>
                      </div>
                    </div>
                  </SettingsCard>
                </SettingsSection>
              )}

              {/* Channels List */}
              <SettingsSection
                title="Configured Channels"
                description="Channel sessions inherit MCP tools from workspace sources."
              >
                {channels.length === 0 ? (
                  <div className="rounded-xl border border-border/50 p-6">
                    <p className="text-sm text-muted-foreground text-center">
                      No channels configured.{" "}
                      {!showForm && (
                        <button
                          type="button"
                          onClick={handleOpenForm}
                          className="text-foreground hover:underline"
                        >
                          Add a channel
                        </button>
                      )}
                    </p>
                  </div>
                ) : (
                  <SettingsCard>
                    {channels.map((channel) => (
                      <SettingsRow
                        key={channel.slug}
                        label={
                          <span className="flex items-center gap-2">
                            <AdapterIcon adapter={channel.adapter} />
                            <span>{channel.slug}</span>
                            <span className="text-xs text-muted-foreground">
                              {channel.adapter}
                            </span>
                          </span>
                        }
                        action={
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteChannel(channel.slug)}
                              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete channel"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        }
                      >
                        <Switch
                          checked={channel.enabled}
                          onCheckedChange={(checked) =>
                            handleToggleChannel(channel, checked)
                          }
                        />
                      </SettingsRow>
                    ))}
                  </SettingsCard>
                )}
              </SettingsSection>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
