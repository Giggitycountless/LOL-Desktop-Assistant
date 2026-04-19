import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { ParticipantProfilePanel, type SelectedParticipant } from "../components/ParticipantProfilePanel";
import { useAppState } from "../state/AppStateProvider";
import {
  isSelectedParticipant,
  participantProfileHash,
  PARTICIPANT_PROFILE_CHANGED_EVENT,
  PARTICIPANT_PROFILE_SELECTED_EVENT,
  sameParticipant,
} from "../windows/participantProfileWindow";

export function ParticipantProfileWindow({ initialSelection }: { initialSelection: SelectedParticipant | null }) {
  const { loadParticipantProfile } = useAppState();
  const [selection, setSelection] = useState<SelectedParticipant | null>(initialSelection);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<unknown>(PARTICIPANT_PROFILE_SELECTED_EVENT, (event) => {
      if (!isSelectedParticipant(event.payload)) {
        return;
      }

      setSelection(event.payload);
      window.history.replaceState(null, "", participantProfileHash(event.payload));
      void loadParticipantProfile({ ...event.payload, recentLimit: 6 });
    }).then((handler) => {
      unlisten = handler;
    });

    return () => {
      unlisten?.();
    };
  }, [loadParticipantProfile]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<unknown>(PARTICIPANT_PROFILE_CHANGED_EVENT, (event) => {
      if (!isSelectedParticipant(event.payload) || !sameParticipant(selection, event.payload)) {
        return;
      }

      void loadParticipantProfile({ ...event.payload, recentLimit: 6 });
    }).then((handler) => {
      unlisten = handler;
    });

    return () => {
      unlisten?.();
    };
  }, [loadParticipantProfile, selection]);

  return (
    <main className="min-h-screen bg-zinc-100 p-4 text-zinc-950">
      <ParticipantProfilePanel className="min-h-[calc(100vh-2rem)]" selection={selection} />
    </main>
  );
}
