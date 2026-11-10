import { useState } from 'react';
import MoreVertIcon from '@expo/material-symbols/more_vert.xml';
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  Icon,
  IconButton,
  Text,
} from '@expo/ui/jetpack-compose';
import { testID } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '../ui';
import type { TaskActionsProps } from './TaskActions';

export function TaskActions({ title, nextStatusLabel, disabled, onChangeStatus, onDelete }: TaskActionsProps) {
  const [expanded, setExpanded] = useState(false);
  const { mode, palette } = useTheme();

  const runAction = (action: () => void) => {
    setExpanded(false);
    action();
  };

  return (
    <Host colorScheme={mode} matchContents style={{ width: 48, height: 48 }}>
      <DropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)}>
        <DropdownMenu.Trigger>
          <IconButton
            enabled={!disabled}
            onClick={() => setExpanded(true)}
            modifiers={[testID(`task-actions-${title}`)]}
          >
            <Icon
              source={MoreVertIcon}
              size={24}
              tint={palette.muted}
              contentDescription={`More actions for ${title}`}
            />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          <DropdownMenuItem enabled={!disabled} onClick={() => runAction(onChangeStatus)}>
            <DropdownMenuItem.Text>
              <Text>Move to {nextStatusLabel}</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
          <DropdownMenuItem enabled={!disabled} onClick={() => runAction(onDelete)}>
            <DropdownMenuItem.Text>
              <Text color={palette.danger}>Delete task</Text>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
