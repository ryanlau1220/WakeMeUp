/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@copilotkit/react-native/headless', () => ({
  CopilotKitProvider: ({ children }: { children: React.ReactNode }) => children,
  useAgentContext: jest.fn(),
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
