import { DeviceGateway } from '../device.gateway';

describe('DeviceGateway command dispatch authorization', () => {
  const makeGateway = () => {
    const devicesService = {
      findOneById: jest.fn(),
    };
    const commandsService = {
      create: jest.fn(),
      complete: jest.fn(),
    };
    const broadcastService = {
      setNamespace: jest.fn(),
    };
    const eventEmitter = {
      emit: jest.fn(),
    };
    const emit = jest.fn();
    const namespace = {
      in: jest.fn(),
      to: jest.fn(() => ({ emit })),
    };

    const gateway = new DeviceGateway(
      devicesService as any,
      commandsService as any,
      broadcastService as any,
      eventEmitter as any,
    );
    gateway.namespace = namespace as any;

    return {
      gateway,
      devicesService,
      commandsService,
      namespace,
      emit,
    };
  };

  const client = {
    id: 'sender-socket',
    data: { userId: 'user-1' },
  } as any;

  const envelope = {
    requestId: 'req-1',
    timestamp: '2026-04-28T07:00:00.000Z',
    data: {
      commandId: 'client-command',
      targetDeviceId: 'device-1',
      type: 'shell',
      action: 'echo ok',
      timeout: 30000,
    },
  } as any;

  it('rejects commands for devices the issuer does not own', async () => {
    const { gateway, devicesService, commandsService, namespace } = makeGateway();
    devicesService.findOneById.mockRejectedValue(new Error('Forbidden'));

    const response = await gateway.handleCommandSend(client, envelope);

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('DEVICE_NOT_AVAILABLE');
    expect(namespace.in).not.toHaveBeenCalled();
    expect(commandsService.create).not.toHaveBeenCalled();
  });

  it('does not create a command when no connected socket belongs to the issuer', async () => {
    const { gateway, devicesService, commandsService, namespace } = makeGateway();
    devicesService.findOneById.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
    });
    namespace.in.mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue([
        {
          id: 'other-socket',
          data: { userId: 'user-2', deviceId: 'device-1' },
        },
      ]),
    });

    const response = await gateway.handleCommandSend(client, envelope);

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('DEVICE_OFFLINE');
    expect(commandsService.create).not.toHaveBeenCalled();
  });

  it('dispatches only to sockets for the issuer and target device', async () => {
    const { gateway, devicesService, commandsService, namespace, emit } =
      makeGateway();
    devicesService.findOneById.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
    });
    namespace.in.mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue([
        {
          id: 'owner-socket',
          data: { userId: 'user-1', deviceId: 'device-1' },
        },
        {
          id: 'other-user-socket',
          data: { userId: 'user-2', deviceId: 'device-1' },
        },
        {
          id: 'other-device-socket',
          data: { userId: 'user-1', deviceId: 'device-2' },
        },
      ]),
    });
    commandsService.create.mockResolvedValue({ id: 'cmd-1' });

    const response = await gateway.handleCommandSend(client, envelope);

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ commandId: 'cmd-1', status: 'dispatched' });
    expect(namespace.to).toHaveBeenCalledWith('owner-socket');
    expect(namespace.to).toHaveBeenCalledWith('u-user-1');
    expect(namespace.to).not.toHaveBeenCalledWith('d-device-1');
    expect(namespace.to).not.toHaveBeenCalledWith('other-user-socket');
    expect(namespace.to).not.toHaveBeenCalledWith('other-device-socket');
    expect(emit).toHaveBeenCalledWith(
      'device:command:execute',
      expect.objectContaining({
        commandId: 'cmd-1',
        targetDeviceId: 'device-1',
        action: 'echo ok',
      }),
    );
  });
});
