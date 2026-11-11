export type PlaybackSeekProps = {
  max: number;
  value: number;
  enabled: boolean;
  onValueChange: (value: number) => void;
  onValueChangeFinished: () => void;
};
