import type { Visibility } from "@larder/shared";
import { Globe, Lock } from "lucide-react";
import { type ChipOption, ChipRadioGroup } from "./chip-radio-group.tsx";

const choices: ChipOption<boolean>[] = [
  { value: false, label: "Public", icon: Globe },
  { value: true, label: "Only me", icon: Lock },
];

export function FeedbackVisibility({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: boolean; onChange: (value: boolean) => void }>) {
  return <ChipRadioGroup label={label} options={choices} value={value} onChange={onChange} />;
}

const filters: ChipOption<Visibility | undefined>[] = [
  { value: undefined, label: "All" },
  { value: "public", label: "Public", icon: Globe },
  { value: "private", label: "Private", icon: Lock },
];

export function FeedbackVisibilityFilter({
  value,
  onChange,
}: Readonly<{ value: Visibility | undefined; onChange: (value: Visibility | undefined) => void }>) {
  return (
    <ChipRadioGroup
      label="Filter by visibility"
      options={filters}
      value={value}
      onChange={onChange}
    />
  );
}

export function PrivateFeedbackLabel() {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Lock className="size-3.5" aria-hidden />
      Only you
    </span>
  );
}
