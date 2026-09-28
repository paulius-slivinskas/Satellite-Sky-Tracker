import { Input, Label, ListBox, Select, Switch, TextField } from '@heroui/react';
import type { CSSProperties } from 'react';
export function Toggle({
  label,
  selected,
  onChange,
  color,
}: {
  label: string;
  selected: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}) {
  return (
    <Switch className="filter-switch" isSelected={selected} onChange={onChange} size="sm">
      <Switch.Content>
        <Label>
          {color && (
            <span className="category-dot" style={{ background: color } as CSSProperties} />
          )}
          {label}
        </Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <TextField className="field" value={value} onChange={onChange} type={type}>
      <Label>{label}</Label>
      <Input
        placeholder={placeholder}
        min={min}
        max={max}
        step={type === 'number' ? 'any' : undefined}
      />
    </TextField>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      className="field"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([id, name]) => (
            <ListBox.Item key={id} id={id} textValue={name}>
              {name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
