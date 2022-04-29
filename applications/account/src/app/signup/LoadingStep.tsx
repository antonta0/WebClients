import { useEffect, useState } from 'react';
import { c } from 'ttag';
import { noop } from '@proton/shared/lib/helpers/function';
import { CircleLoader, classnames, Icon, ProtonLogo } from '@proton/components';
import Content from '../public/Content';
import Main from '../public/Main';

interface Props {
    onSetup: () => Promise<void>;
    hasPayment?: boolean;
}

const LoadingStep = ({ onSetup, hasPayment }: Props) => {
    const [steps, setSteps] = useState(() => {
        return [
            {
                loading: true,
                text: c('Info').t`Creating your account`,
            },
        ];
    });

    useEffect(() => {
        onSetup().catch(noop);

        const interval = setInterval(() => {
            setSteps((steps) => {
                const stepsWithoutLoading = steps.map((step) => ({ ...step, loading: false }));

                if (stepsWithoutLoading.length === 1) {
                    return [
                        ...stepsWithoutLoading,
                        {
                            loading: true,
                            text: c('Info').t`Securing your account`,
                        },
                    ];
                }

                clearInterval(interval);

                if (!hasPayment) {
                    return steps;
                }

                return [
                    ...stepsWithoutLoading,
                    {
                        loading: true,
                        text: c('Info').t`Verifying your payment`,
                    },
                ];
            });
        }, 2500);
        return () => {
            clearInterval(interval);
        };
    }, []);

    return (
        <Main>
            <Content>
                <div className="text-center">
                    <ProtonLogo size={60} variant="glyph-only" />
                    <hr className="mb2 mt2" />
                    <div className="inline-block">
                        {steps.map(({ loading, text }) => {
                            return (
                                <div className="text-lg" key={text}>
                                    <div
                                        className={classnames([
                                            'flex-no-min-children flex-align-items-center',
                                            loading && 'color-primary',
                                        ])}
                                    >
                                        <div className="mr0-5 min-w2e flex flex-item-noshrink">
                                            {loading ? (
                                                <CircleLoader size="small" className="ml0-25" />
                                            ) : (
                                                <Icon size={24} className="color-success" name="checkmark" />
                                            )}
                                        </div>
                                        <div className="text-ellipsis p0-5">{text}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Content>
        </Main>
    );
};

export default LoadingStep;