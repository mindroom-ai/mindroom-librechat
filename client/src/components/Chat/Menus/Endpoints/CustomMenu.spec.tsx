import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomMenu } from './CustomMenu';

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

describe('CustomMenu', () => {
  test('calls onOpenChange(true) when menu is opened', async () => {
    const onOpenChange = jest.fn();
    const user = userEvent.setup();

    render(
      <CustomMenu label="Models" onOpenChange={onOpenChange}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <div>Menu Content</div>
      </CustomMenu>,
    );

    await user.click(screen.getByRole('button', { name: /models/i }));

    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });
});
