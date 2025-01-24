"use client"
import {useEffect, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {AlertDialog, Button, Flex, Text} from '@radix-ui/themes';
import * as Toast from '@radix-ui/react-toast';

export const ErrorNotification = () => {
  const errorNotification = useMapStore(state => state.errorNotification);
  const [errorUiActive, setErrorUiActive] = useState(true);

  useEffect(() => {
    errorNotification.message && setErrorUiActive(true);
  }, [errorNotification]);

  if (!errorUiActive || !errorNotification.message || !errorNotification.severity) {
    return null;
  }
  const ErrorDescription = () => (
    <>
      <Text as="p" mb={'4'}>
        {errorNotification.message}
      </Text>
      <Text as="p" mb={'4'}>
        {!!errorNotification?.id && <i>Error ID: {errorNotification.id}</i>}
      </Text>
      <Text as="p" mb={'4'}>
        {!!errorNotification?.severity && <i>Severity: {errorNotification.severity}</i>}
      </Text>
    </>
  );

  switch (errorNotification.severity) {
    case 1:
      return (
        <AlertDialog.Root open={errorUiActive}>
          <AlertDialog.Content maxWidth="450px">
            <AlertDialog.Title>Error</AlertDialog.Title>
            <AlertDialog.Description size="2">
              <ErrorDescription />
            </AlertDialog.Description>

            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Action>
                <Button variant="solid" color="red" onClick={() => setErrorUiActive(false)}>
                  Dismiss
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      );
    case 2:
      return (
        <Toast.Provider swipeDirection="right">
          <Toast.Root
            className="flex flex-col rounded-md bg-white p-[15px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[state=closed]:animate-hide data-[state=open]:animate-slideIn data-[swipe=end]:animate-swipeOut data-[swipe=cancel]:transition-[transform_200ms_ease-out]"
            open={errorUiActive}
            onOpenChange={setErrorUiActive}
          >
            <Toast.Title className="mb-[5px] text-[15px] font-medium text-slate12">
              Error
            </Toast.Title>
            <Toast.Description asChild>
              <ErrorDescription />
            </Toast.Description>
            <Toast.Action asChild altText="Dismiss">
              <Button variant="solid" color="red" onClick={() => setErrorUiActive(false)}>
                Dismiss
              </Button>
            </Toast.Action>
          </Toast.Root>
          <Toast.Viewport className="fixed bottom-0 right-0 z-[2147483647] m-0 flex w-[390px] max-w-[100vw] list-none flex-col gap-2.5 p-[var(--viewport-padding)] outline-none [--viewport-padding:_25px]" />
        </Toast.Provider>
      );
    default:
      return null;
  }
};
