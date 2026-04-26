import { useEffect, useState } from "react";

import { ParticipantProfilePanel, type SelectedParticipant } from "../components/ParticipantProfilePanel";
import { listenWithCleanup } from "../backend/events";
import { useAppCore } from "../state/AppStateProvider";
import {
  isSelectedParticipant,
  participantProfileHash,
  PARTICIPANT_PROFILE_CHANGED_EVENT,
  PARTICIPANT_PROFILE_SELECTED_EVENT,
  sameParticipant,
} from "../windows/participantProfileWindow";

export function ParticipantProfileWindow({ initialSelection }: { initialSelection: SelectedParticipant | null }) {
  const { loadParticipantProfile } = useAppCore();
  const [selection, setSelection] = useState<SelectedParticipant | null>(initialSelection);

  useEffect(() => {
    return listenWithCleanup<unknown>(PARTICIPANT_PROFILE_SELECTED_EVENT, (event) => {
      if (!isSelectedParticipant(event.payload)) {
        return;
      }

      setSelection(event.payload);
      window.history.replaceState(null, "", participantProfileHash(event.payload));
      void loadParticipantProfile({ ...event.payload, recentLimit: 6 });
    });
  }, [loadParticipantProfile]);

  useEffect(() => {
    return listenWithCleanup<unknown>(PARTICIPANT_PROFILE_CHANGED_EVENT, (event) => {
      if (!isSelectedParticipant(event.payload) || !sameParticipant(selection, event.payload)) {
        return;
      }

      void loadParticipantProfile({ ...event.payload, recentLimit: 6 });
    });
  }, [loadParticipantProfile, selection]);

  return (
    <main className="min-h-screen bg-zinc-100 p-4 text-zinc-950">
      <ParticipantProfilePanel className="min-h-[calc(100vh-2rem)]" selection={selection} />
    </main>
  );
}
