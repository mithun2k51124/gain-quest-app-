import { type DefaultRouterOptions, type EventMapBase, type NavigationAction, type NavigationProp, type NavigatorTypeBagBase, type ParamListBase, type RouterFactory, type StaticConfig, type StaticParamList, type StaticScreenFactory, type TypedNavigator } from '@react-navigation/core';
import * as React from 'react';
import type { createStandardNavigator } from 'standard-navigation';
type StandardEventMap<EventMap extends EventMapBase> = {
    [EventName in keyof EventMap]: {
        data: EventMap[EventName] extends {
            data?: infer Data;
        } ? Data extends object | undefined ? Data : object | undefined : undefined;
        canPreventDefault: EventMap[EventName] extends {
            canPreventDefault: true;
        } ? true : false;
    };
};
type ActionHelpersOf<T> = T extends Record<string, (...args: never[]) => unknown> ? T : {};
type StandardNavigationTypeBagFor<TypeBag extends StandardNavigationTypeBagBase, ParamList extends ParamListBase, NavigatorID extends string | undefined = string | undefined> = TypeBag & {
    ParamList: ParamList;
    NavigatorID: NavigatorID;
};
type StandardNavigation<TypeBag extends StandardNavigationTypeBagBase> = StandardNavigationTypeBagFor<TypeBag, ParamListBase>['NavigationList'][keyof StandardNavigationTypeBagFor<TypeBag, ParamListBase>['NavigationList']];
type StandardNavigationPropsMapper<TypeBag extends StandardNavigationTypeBagBase, NavigatorProps extends object> = (props: {
    state: StandardNavigationTypeBagFor<TypeBag, ParamListBase>['State'];
    navigation: StandardNavigation<TypeBag>;
}) => Partial<NavigatorProps>;
type StandardNavigationDefaultBag<TypeBag extends StandardNavigationTypeBagBase> = StandardNavigationTypeBagFor<TypeBag, ParamListBase, string | undefined>;
type StandardNavigationFactories<TypeBag extends StandardNavigationTypeBagBase> = {
    createNavigator: StandardNavigationCreateNavigator<TypeBag>;
    createScreen: StaticScreenFactory<StandardNavigationDefaultBag<TypeBag>>;
};
export type StandardNavigationCreateNavigator<TypeBag extends StandardNavigationTypeBagBase> = {
    <const ParamList extends ParamListBase, const NavigatorID extends string | undefined = string | undefined>(): TypedNavigator<StandardNavigationTypeBagFor<TypeBag, ParamList, NavigatorID>, undefined>;
    <const Config extends StaticConfig<StandardNavigationDefaultBag<TypeBag>>>(config: Config & StaticConfig<StandardNavigationDefaultBag<TypeBag>>): TypedNavigator<StandardNavigationTypeBagFor<TypeBag, StaticParamList<{
        config: Config;
    }> & ParamListBase, string | undefined>, Config>;
};
export interface StandardNavigationTypeBagBase extends NavigatorTypeBagBase {
    ActionHelpers: {};
    ScreenOptions: {};
    EventMap: EventMapBase;
    RouterOptions: DefaultRouterOptions;
    NavigationList: {
        [RouteName in keyof this['ParamList']]: NavigationProp<this['ParamList'], RouteName, this['NavigatorID'], this['State'], this['ScreenOptions'], this['EventMap']> & ActionHelpersOf<this['ActionHelpers']>;
    };
    Navigator: React.ComponentType<{}>;
}
export declare function createStandardNavigationFactories<TypeBag extends StandardNavigationTypeBagBase, NavigatorProps extends object = {}>(navigator: ReturnType<typeof createStandardNavigator<TypeBag['ScreenOptions'], StandardEventMap<TypeBag['EventMap']>, NavigatorProps>>, router: RouterFactory<StandardNavigationTypeBagFor<TypeBag, ParamListBase>['State'], NavigationAction, TypeBag['RouterOptions']>, mapper?: StandardNavigationPropsMapper<TypeBag, NavigatorProps>): StandardNavigationFactories<TypeBag>;
export {};
//# sourceMappingURL=createStandardNavigationFactories.d.ts.map