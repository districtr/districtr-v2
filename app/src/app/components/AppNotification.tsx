'use client';
import {useEffect, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {AlertDialog, Button, Flex, Text} from '@radix-ui/themes';
import {CheckCircledIcon, ExclamationTriangleIcon, InfoCircledIcon} from '@radix-ui/react-icons';
import * as Toast from '@radix-ui/react-toast';

/** Per-type presentation: dialog title, accent color, toast background, and icon. */
const TYPE_META = {
  error: {
    title: 'Error',
    color: 'red',
    toastClass: 'bg-red-600 border-red-700',
    Icon: ExclamationTriangleIcon,
  },
  notification: {
    title: 'Notice',
    color: 'blue',
    toastClass: 'bg-blue-600 border-blue-700',
    Icon: InfoCircledIcon,
  },
  success: {
    title: 'Success',
    color: 'green',
    toastClass: 'bg-green-600 border-green-700',
    Icon: CheckCircledIcon,
  },
} as const;

/**
 * Global notification UI, driven by mapStore's `notification`. Importance picks
 * the surface (1: blocking dialog, 2: toast, 3: silent); `type` picks the tone
 * and color — errors are red with a Dismiss affordance and diagnostic details,
 * notifications and successes are blue/green self-dismissing toasts.
 */
export const AppNotification = () => {
  const notification = useMapStore(state => state.notification);
  const setNotification = useMapStore(state => state.setNotification);
  const [uiActive, setUiActive] = useState(true);
  // Bumped per notification so back-to-back identical messages (e.g. repeated
  // autosaves) remount the toast and restart its auto-dismiss timer.
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (notification.message) {
      setUiActive(true);
      setSeq(s => s + 1);
    }
  }, [notification]);

  if (!uiActive || !notification.message || !notification.importance) {
    return null;
  }
  const type = notification.type ?? 'notification';
  const isError = type === 'error';
  const {title, color, toastClass, Icon} = TYPE_META[type];
  const Description = () => (
    <>
      <Text as="p" mb={'4'}>
        {notification.message}
      </Text>
      {isError && (
        <>
          <Text as="p" mb={'4'}>
            {!!notification?.id && <i>Error ID: {notification.id}</i>}
          </Text>
          <Text as="p" mb={'4'}>
            {!!notification?.importance && <i>Importance: {notification.importance}</i>}
          </Text>
        </>
      )}
    </>
  );

  switch (notification.importance) {
    case 1:
      return (
        <AlertDialog.Root open={uiActive}>
          <AlertDialog.Content maxWidth="450px">
            <AlertDialog.Title>{title}</AlertDialog.Title>
            <AlertDialog.Description size="2">
              <Description />
            </AlertDialog.Description>

            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Action>
                <Button variant="solid" color={color} onClick={() => setUiActive(false)}>
                  Dismiss
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      );
    case 2:
      return (
        <Toast.Provider swipeDirection="right" duration={isError ? 5000 : 3000}>
          <Toast.Root
            key={seq}
            className={`flex flex-col rounded-lg border p-4 text-white shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[state=closed]:animate-hide data-[state=open]:animate-slideIn data-[swipe=end]:animate-swipeOut data-[swipe=cancel]:transition-[transform_200ms_ease-out] ${toastClass}`}
            open={uiActive}
            onOpenChange={(openChange) => {
              setUiActive(openChange)
              if (!openChange) {
                setNotification({})
              }
            }}
          >
            {isError ? (
              <>
                <Toast.Title asChild>
                  <Text size="3" weight="bold" className="mb-1 flex items-center gap-2">
                    <Icon className="size-5 shrink-0" />
                    {title}
                  </Text>
                </Toast.Title>
                <Toast.Description asChild>
                  <Description />
                </Toast.Description>
                <Toast.Action asChild altText="Dismiss">
                  <Button
                    variant="solid"
                    className="!bg-white/25 !text-white hover:!bg-white/35"
                    onClick={() => setUiActive(false)}
                  >
                    Dismiss
                  </Button>
                </Toast.Action>
              </>
            ) : (
              <Toast.Title asChild>
                <Text size="3" weight="medium" className="flex items-center gap-2">
                  <Icon className="size-5 shrink-0" />
                  {notification.message}
                </Text>
              </Toast.Title>
            )}
          </Toast.Root>
          <Toast.Viewport className="fixed bottom-0 right-0 z-[2147483647] m-0 flex w-[390px] max-w-[100vw] list-none flex-col gap-2.5 p-[var(--viewport-padding)] outline-none [--viewport-padding:_25px]" />
        </Toast.Provider>
      );
    default:
      return null;
  }
};
